import { describe, expect, it } from 'vitest'
import { BENCH_SEATS, IslandPlan } from './desks'

function deskOf(plan: IslandPlan, id: number) {
  return plan.desks().find((desk) => desk.id === id)!
}

describe('IslandPlan', () => {
  it('demarre avec deux ilots vides de cinq bureaux (un lead, quatre postes)', () => {
    const plan = new IslandPlan(2)
    expect(plan.islands).toBe(2)
    const island = plan.desks().filter((desk) => desk.island === 0)
    expect(island.map((desk) => [desk.kind, desk.seat])).toEqual([
      ['lead', 0],
      ['bench', 0],
      ['bench', 1],
      ['bench', 2],
      ['bench', 3]
    ])
    expect(plan.desks().every((desk) => desk.occupantId === null)).toBe(true)
  })

  it('donne a chaque session le bureau de lead d’un ilot vide', () => {
    const plan = new IslandPlan(2)
    expect(deskOf(plan, plan.assignLeadDesk('s1'))).toMatchObject({ kind: 'lead', island: 0 })
    expect(deskOf(plan, plan.assignLeadDesk('s2'))).toMatchObject({ kind: 'lead', island: 1 })
  })

  it('ajoute un ilot quand tous les leads sont pris', () => {
    const plan = new IslandPlan(2)
    plan.assignLeadDesk('s1')
    plan.assignLeadDesk('s2')
    expect(deskOf(plan, plan.assignLeadDesk('s3')).island).toBe(2)
    expect(plan.islands).toBe(3)
  })

  it('installe les sous-agents dans l’ilot de leur session, poste par poste', () => {
    const plan = new IslandPlan(2)
    plan.assignLeadDesk('s1')
    const lead = plan.assignLeadDesk('s2')
    const seats = ['a1', 'a2', 'a3', 'a4'].map((id) => deskOf(plan, plan.assignBenchDesk(id, lead)))
    expect(seats.map((desk) => [desk.kind, desk.island, desk.seat])).toEqual([
      ['bench', 1, 0],
      ['bench', 1, 1],
      ['bench', 1, 2],
      ['bench', 1, 3]
    ])
  })

  it('deborde d’abord vers un ilot sans lead plutot que chez une autre equipe', () => {
    const plan = new IslandPlan(2)
    const s1 = plan.assignLeadDesk('s1')
    plan.assignLeadDesk('s2')
    plan.assignLeadDesk('s3')
    plan.release(plan.desks().find((desk) => desk.occupantId === 's2')!.id)
    for (let i = 0; i < BENCH_SEATS; i++) plan.assignBenchDesk(`a${i}`, s1)
    expect(deskOf(plan, plan.assignBenchDesk('extra', s1)).island).toBe(1)
  })

  it('deborde chez l’equipe la plus proche quand tous les ilots ont un lead', () => {
    const plan = new IslandPlan(2)
    const s1 = plan.assignLeadDesk('s1')
    plan.assignLeadDesk('s2')
    plan.assignLeadDesk('s3')
    for (let i = 0; i < BENCH_SEATS; i++) plan.assignBenchDesk(`a${i}`, s1)
    expect(deskOf(plan, plan.assignBenchDesk('extra', s1)).island).toBe(1)
  })

  it('agrandit la salle quand tous les postes sont pris', () => {
    const plan = new IslandPlan(2)
    const s1 = plan.assignLeadDesk('s1')
    plan.assignLeadDesk('s2')
    for (let i = 0; i < 2 * BENCH_SEATS; i++) plan.assignBenchDesk(`a${i}`, s1)
    const extra = deskOf(plan, plan.assignBenchDesk('extra', s1))
    expect(extra).toMatchObject({ kind: 'bench', island: 2 })
    expect(plan.islands).toBe(3)
  })

  it('prend un lead libre dans un ilot deja occupe par des debordements', () => {
    const plan = new IslandPlan(1)
    const s1 = plan.assignLeadDesk('s1')
    plan.assignLeadDesk('s2')
    for (let i = 0; i < BENCH_SEATS + 1; i++) plan.assignBenchDesk(`a${i}`, s1)
    plan.release(plan.desks().find((desk) => desk.occupantId === 's2')!.id)
    expect(deskOf(plan, plan.assignLeadDesk('s3'))).toMatchObject({ kind: 'lead', island: 1 })
  })

  it('libere un bureau et retire les ilots vides en fin de salle', () => {
    const plan = new IslandPlan(2)
    plan.assignLeadDesk('s1')
    plan.assignLeadDesk('s2')
    const s3 = plan.assignLeadDesk('s3')
    plan.release(s3)
    expect(plan.islands).toBe(2)
    expect(deskOf(plan, plan.assignLeadDesk('s4')).island).toBe(2)
  })

  it('reutilise un ilot libere au milieu de la salle', () => {
    const plan = new IslandPlan(2)
    const s1 = plan.assignLeadDesk('s1')
    plan.assignLeadDesk('s2')
    plan.release(s1)
    expect(deskOf(plan, plan.assignLeadDesk('s3')).island).toBe(0)
  })
})
