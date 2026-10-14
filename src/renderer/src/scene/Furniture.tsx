import { useGLTF } from '@react-three/drei'
import { useMemo } from 'react'
import { Box3, Group, Mesh, Vector3, type Object3D } from 'three'
import type { Vec3 } from './layout'

const FURNITURE_NAMES = [
  'bookcaseClosed',
  'chair',
  'chairDesk',
  'coatRackStanding',
  'computerKeyboard',
  'computerMouse',
  'computerScreen',
  'desk',
  'deskCorner',
  'kitchenBar',
  'kitchenCoffeeMachine',
  'kitchenFridge',
  'lampSquareFloor',
  'loungeChair',
  'loungeSofa',
  'plantSmall1',
  'plantSmall3',
  'pottedPlant',
  'rugRound',
  'stoolBar',
  'table',
  'tableCoffee',
  'trashcan',
  'wall',
  'wallDoorway',
  'wallWindow'
] as const

export type FurnitureName = (typeof FURNITURE_NAMES)[number]

// centered : pivot ramene au centre de la base, pour poser l'objet par son milieu.
// corner : pivot d'origine Kenney (coin du modele), pratique pour aligner les tuiles de mur.
export type Anchor = 'centered' | 'corner'

function furnitureUrl(name: FurnitureName): string {
  return `${import.meta.env.BASE_URL}models/furniture/${name}.glb`
}

interface FurnitureProps {
  name: FurnitureName
  position?: Vec3
  rotationY?: number
  anchor?: Anchor
}

export function Furniture({
  name,
  position = [0, 0, 0],
  rotationY = 0,
  anchor = 'centered'
}: FurnitureProps): React.JSX.Element {
  const { scene } = useGLTF(furnitureUrl(name), false)
  const object = useMemo(() => prepare(scene, anchor), [scene, anchor])
  return <primitive object={object} position={position} rotation-y={rotationY} />
}

function prepare(source: Object3D, anchor: Anchor): Object3D {
  const model = source.clone(true)
  model.traverse((child) => {
    if (child instanceof Mesh) {
      child.castShadow = true
      child.receiveShadow = true
    }
  })
  if (anchor === 'corner') {
    return model
  }
  const box = new Box3().setFromObject(model)
  const center = box.getCenter(new Vector3())
  model.position.set(-center.x, -box.min.y, -center.z)
  const pivot = new Group()
  pivot.add(model)
  return pivot
}

for (const name of FURNITURE_NAMES) {
  useGLTF.preload(furnitureUrl(name), false)
}
