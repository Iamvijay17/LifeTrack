import { beforeEach, describe, expect, it } from 'vitest'
import * as store from '@/hooks/store'
import { setUserId } from '@/services/session'
import { buildExport, importBackup, parseBackup } from '@/services/backup'
import { seedDefaults } from '@/services/api'
import { db } from '@/services/db'

beforeEach(() => {
  localStorage.clear()
  store.resetStore()
})

describe('export / restore round trip', () => {
  it('restores into a DIFFERENT account that already has default topics, remapping foreign keys', async () => {
    setUserId('A')
    await seedDefaults()
    const react = (await db.list('learning_topics')).find((t) => t.name === 'React')
    const goal = await store.insert('goals', { title: 'Learn React', topic_id: react.id, target_minutes: 600 })
    await store.insert('study_sessions', { topic_id: react.id, goal_id: goal.id, session_date: '2026-01-01', duration_seconds: 3600 })
    const app = await store.insert('job_applications', { company: 'Acme', job_title: 'Dev' })
    await store.update('job_applications', app.id, { status: 'applied' })
    await store.upsert('health_logs', { log_date: '2026-01-01', water_ml: 500 }, { onConflict: 'user_id,log_date' })
    const file = JSON.stringify(await buildExport())

    store.resetStore()
    setUserId('B')
    await seedDefaults() // B already owns a different "React" topic
    await store.upsert('health_logs', { log_date: '2026-01-01', water_ml: 100 }, { onConflict: 'user_id,log_date' })
    await importBackup(parseBackup(file))

    const topics = await db.list('learning_topics')
    expect(topics.filter((t) => t.name === 'React')).toHaveLength(1)
    const [g] = await db.list('goals')
    expect(g.topic_id).toBe(topics.find((t) => t.name === 'React').id)
    expect((await db.list('study_sessions'))[0].topic_id).toBe(g.topic_id)
    expect(await db.list('health_logs')).toHaveLength(1)
    expect((await db.list('health_logs'))[0].water_ml).toBe(500) // backup wins on conflict
    const hist = await db.list('application_history')
    expect(hist.map((h) => h.to_status)).toEqual(['interested', 'applied']) // no duplicate "created" row
    setUserId('A')
    expect(await db.list('goals')).toHaveLength(1) // account A untouched
  })

  it('restores nutrition data into an account that already has its own targets and starter-food copy', async () => {
    setUserId('A')
    const food = await store.insert('foods', { name: 'My shake', kcal: 200 })
    const copy = await store.insert('foods', { name: 'Idli', base_key: 'idli', kcal: 70 })
    await store.insert('food_logs', { log_date: '2026-11-10', meal_type: 'breakfast', name: 'Idli', food_id: copy.id, kcal: 140 })
    await store.insert('food_logs', { log_date: '2026-11-10', meal_type: 'snack', name: 'My shake', food_id: food.id, kcal: 200 })
    await store.upsert('nutrition_settings', { calorie_goal: 2200 }, { onConflict: 'user_id' })
    const file = JSON.stringify(await buildExport())

    store.resetStore()
    setUserId('B')
    await store.insert('foods', { name: 'Idli', base_key: 'idli', kcal: 60 }) // B has its own copy of the same starter food
    await store.upsert('nutrition_settings', { calorie_goal: 1800 }, { onConflict: 'user_id' })
    await importBackup(parseBackup(file))

    const settings = await db.list('nutrition_settings')
    expect(settings).toHaveLength(1)
    expect(settings[0].calorie_goal).toBe(2200) // backup wins
    const foods = await db.list('foods')
    expect(foods.filter((f) => f.base_key === 'idli')).toHaveLength(1)
    expect(foods.filter((f) => f.name === 'My shake')).toHaveLength(1)
    const idli = foods.find((f) => f.base_key === 'idli')
    const logs = await db.list('food_logs')
    expect(logs).toHaveLength(2)
    expect(logs.find((l) => l.name === 'Idli').food_id).toBe(idli.id) // log follows B's copy
  })

  it('is idempotent: importing the same file twice changes nothing', async () => {
    setUserId('A')
    await store.insert('tasks', { title: 't1' })
    await store.insert('transactions', { type: 'expense', amount_paise: 12345, txn_date: '2026-01-01' })
    const file = parseBackup(JSON.stringify(await buildExport()))
    await importBackup(file)
    await importBackup(file)
    expect(await db.list('tasks')).toHaveLength(1)
    expect((await db.list('transactions'))[0].amount_paise).toBe(12345)
  })
})
