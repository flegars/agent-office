import { Html, useGLTF } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AnimationMixer,
  Euler,
  Quaternion,
  SkinnedMesh,
  type AnimationClip,
  type AnimationAction,
  type Group,
  type Object3D
} from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { AgentState } from '../../../../core/types'
import type { RoomBounds, Station } from '../layout'
import { isClick, useHoverCursor } from '../selection'
import {
  advance,
  comeBack,
  leave,
  placementOf,
  reportElapsed,
  startArrival,
  type Motion
} from './motion'
import {
  bubbleFor,
  displayDelayMs,
  gestureFor,
  gestureOffsets,
  REPORT_HANDOVER_SECONDS,
  teamBubble,
  type Bone,
  type Gesture
} from './pose'
import { allCharacterModels, characterModelFor, type CharacterModel } from './roster'

const CHARACTER_SCALE = 0.8
const SEATED_HEIGHT = 0.24
const MAX_ANIMATION_STEP_SECONDS = 0.1
const CLIP_FADE_SECONDS = 0.25
// Les bulles HTML lisent la position du personnage dans leur propre useFrame : on bouge avant elles.
const BEFORE_LABELS_PRIORITY = -1
const PROMPT_BUBBLE_MS = 5_000
const BUBBLE_HEIGHT = 0.62
const RAISED_HAND_BUBBLE_HEIGHT = 0.9
const STANDING_BUBBLE_HEIGHT = 0.95
const REPORT_BUBBLE = '📋'
const SELECTION_RING_ABOVE_FLOOR = 0.015
const BONES: Bone[] = ['torso', 'head', 'arm-left', 'arm-right']

interface Rig {
  root: Object3D
  mixer: AnimationMixer
  actions: Map<string, AnimationAction>
  bones: Map<Bone, Object3D>
  restPose: Map<Bone, Quaternion>
}

function characterUrl(model: CharacterModel): string {
  return `${import.meta.env.BASE_URL}models/characters/${model}.glb`
}

type Stage = 'walking' | 'seated' | 'reporting'

interface CharacterProps {
  agent: AgentState
  station: Station
  parentStation: Station | null
  teamSize: number
  bounds: RoomBounds
  selected: boolean
  onSelect: (id: string) => void
  onGone: (id: string) => void
}

export function Character({
  agent,
  station,
  parentStation,
  teamSize,
  bounds,
  selected,
  onSelect,
  onGone
}: CharacterProps): React.JSX.Element {
  const gltf = useGLTF(characterUrl(characterModelFor(agent.id)), false)
  const rig = useMemo(() => buildRig(gltf.scene, gltf.animations), [gltf])
  const group = useRef<Group>(null)
  const motion = useRef<Motion>(startArrival(bounds, station))
  const place = useRef({ bounds, station, parentStation })
  const currentClip = useRef<string | null>(null)
  const activity = useDisplayedActivity(agent.activity)
  const gestureStart = useRef<{ gesture: Gesture; at: number } | null>(null)
  const goneReported = useRef(false)
  const [stage, setStage] = useState<Stage>('walking')
  const hover = useHoverCursor()

  useEffect(() => {
    place.current = { bounds, station, parentStation }
  }, [bounds, station, parentStation])

  useEffect(() => {
    const current = place.current
    motion.current =
      agent.presence === 'leaving'
        ? leave(motion.current, current.bounds, current.station, current.parentStation)
        : comeBack(motion.current)
  }, [agent.presence])

  useEffect(
    () => () => {
      rig.mixer.stopAllAction()
    },
    [rig]
  )

  useFrame((state, delta) => {
    // Pas de plafond ici : fenetre en arriere-plan, Chromium suspend les images, et au retour
    // chaque personnage doit rattraper d'un coup la position que lui donne le temps ecoule.
    motion.current = advance(motion.current, delta)
    const step = Math.min(delta, MAX_ANIMATION_STEP_SECONDS)
    if (motion.current.phase === 'gone') {
      if (!goneReported.current) {
        goneReported.current = true
        onGone(agent.id)
      }
      return
    }

    const isSeated = motion.current.phase === 'seated'
    const reporting = reportElapsed(motion.current)
    const currentStage: Stage = isSeated ? 'seated' : reporting === null ? 'walking' : 'reporting'
    if (currentStage !== stage) setStage(currentStage)
    const placement = placementOf(motion.current)
    group.current?.position.set(placement.x, isSeated ? SEATED_HEIGHT : 0, placement.z)
    group.current?.rotation.set(0, placement.heading, 0)

    const handingOver = reporting !== null && reporting < REPORT_HANDOVER_SECONDS
    play(rig, currentClip, clipFor(currentStage, handingOver))
    resetPose(rig)
    rig.mixer.update(step)

    const gesture = isSeated
      ? gestureFor(activity)
      : reporting !== null && !handingOver
        ? 'wave'
        : null
    if (gesture === null) {
      gestureStart.current = null
      return
    }
    const now = state.clock.elapsedTime
    if (gestureStart.current?.gesture !== gesture) {
      gestureStart.current = { gesture, at: now }
    }
    applyOffsets(rig, gesture, now - gestureStart.current.at)
  }, BEFORE_LABELS_PRIORITY)

  return (
    <group
      ref={group}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        if (!isClick(event)) return
        event.stopPropagation()
        onSelect(agent.id)
      }}
      {...hover}
    >
      <primitive object={rig.root} scale={CHARACTER_SCALE} />
      {selected && <SelectionRing lift={stage === 'seated' ? -SEATED_HEIGHT : 0} />}
      {stage === 'seated' && agent.presence === 'present' && (
        <Bubbles agent={agent} activity={activity} teamSize={teamSize} />
      )}
      {stage === 'reporting' && (
        <Html
          position={[0, STANDING_BUBBLE_HEIGHT, 0]}
          center
          distanceFactor={6}
          zIndexRange={[20, 10]}
        >
          <div className="bubbles">
            <div className="activity-bubble">{REPORT_BUBBLE}</div>
          </div>
        </Html>
      )}
    </group>
  )
}

function SelectionRing({ lift }: { lift: number }): React.JSX.Element {
  return (
    <mesh
      position-y={lift + SELECTION_RING_ABOVE_FLOOR}
      rotation-x={-Math.PI / 2}
      raycast={() => null}
    >
      <ringGeometry args={[0.32, 0.4, 40]} />
      <meshBasicMaterial color="#f5b83d" transparent opacity={0.9} toneMapped={false} />
    </mesh>
  )
}

function clipFor(stage: Stage, handingOver: boolean): string {
  if (stage === 'seated') return 'sit'
  if (stage === 'walking') return 'walk'
  return handingOver ? 'interact-right' : 'idle'
}

function useDisplayedActivity(activity: AgentState['activity']): AgentState['activity'] {
  const [shown, setShown] = useState(() => ({ activity, since: performance.now() }))
  useEffect(() => {
    if (activity === shown.activity) return
    const timer = setTimeout(
      () => setShown({ activity, since: performance.now() }),
      displayDelayMs(shown.activity, shown.since, performance.now())
    )
    return () => clearTimeout(timer)
  }, [activity, shown])
  return shown.activity
}

interface BubblesProps {
  agent: AgentState
  activity: AgentState['activity']
  teamSize: number
}

function Bubbles({ agent, activity, teamSize }: BubblesProps): React.JSX.Element {
  const [promptShown, setPromptShown] = useState<string | null>(null)
  const lastPrompt = useRef(agent.lastPrompt)

  useEffect(() => {
    if (agent.lastPrompt === lastPrompt.current || !agent.lastPrompt) return
    lastPrompt.current = agent.lastPrompt
    setPromptShown(agent.lastPrompt)
    const timer = setTimeout(() => setPromptShown(null), PROMPT_BUBBLE_MS)
    return () => clearTimeout(timer)
  }, [agent.lastPrompt])

  const waiting = activity === 'waitingInput'
  return (
    <Html
      position={[0, waiting ? RAISED_HAND_BUBBLE_HEIGHT : BUBBLE_HEIGHT, 0]}
      center
      distanceFactor={6}
      zIndexRange={[20, 10]}
    >
      <div className="bubbles">
        {promptShown && <div className="speech">« {excerpt(promptShown)} »</div>}
        <div className={waiting ? 'activity-bubble alert' : 'activity-bubble'}>
          {activity === 'waitingTeam' ? teamBubble(teamSize) : bubbleFor(activity)}
        </div>
      </div>
    </Html>
  )
}

function excerpt(text: string): string {
  return text.length > 60 ? `${text.slice(0, 59)}…` : text
}

function buildRig(source: Object3D, clips: AnimationClip[]): Rig {
  const root = cloneSkinned(source)
  root.traverse((child) => {
    if (child instanceof SkinnedMesh) {
      child.castShadow = true
      child.frustumCulled = false
    }
  })
  const mixer = new AnimationMixer(root)
  const actions = new Map<string, AnimationAction>()
  for (const clip of clips) {
    actions.set(clip.name, mixer.clipAction(clip))
  }
  const bones = new Map<Bone, Object3D>()
  const restPose = new Map<Bone, Quaternion>()
  for (const name of BONES) {
    const bone = root.getObjectByName(name)
    if (bone) {
      bones.set(name, bone)
      restPose.set(name, bone.quaternion.clone())
    }
  }
  return { root, mixer, actions, bones, restPose }
}

// Les clips n'animent pas tous les os : sans remise a zero, les gestes s'accumuleraient d'une image a l'autre.
function resetPose(rig: Rig): void {
  for (const [name, bone] of rig.bones) {
    bone.quaternion.copy(rig.restPose.get(name)!)
  }
}

function play(rig: Rig, current: { current: string | null }, clip: string): void {
  if (current.current === clip) return
  const next = rig.actions.get(clip)
  if (!next) return
  const previous = current.current ? rig.actions.get(current.current) : undefined
  next.reset().play()
  if (previous) previous.crossFadeTo(next, CLIP_FADE_SECONDS, false)
  current.current = clip
}

const euler = new Euler()
const quaternion = new Quaternion()

function applyOffsets(rig: Rig, gesture: Gesture, elapsed: number): void {
  const offsets = gestureOffsets(gesture, elapsed)
  for (const [name, rotation] of Object.entries(offsets) as [Bone, [number, number, number]][]) {
    const bone = rig.bones.get(name)
    if (!bone) continue
    quaternion.setFromEuler(euler.set(rotation[0], rotation[1], rotation[2]))
    bone.quaternion.multiply(quaternion)
  }
}

for (const model of allCharacterModels()) {
  useGLTF.preload(characterUrl(model), false)
}
