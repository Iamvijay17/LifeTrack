import { describe, expect, it } from 'vitest'
import { blankGoal, blankLearningGoal, blankSession, blankTopic, goalFormSchema, goalToForm, goalToPayload, insertSchemas, learningGoalFormSchema, learningGoalToPayload, milestoneFormSchema, sessionFormSchema, sessionFormToPayload, sessionToForm, topicFormSchema, topicToPayload, updateSchemas } from '../src'

const TODAY = '2026-11-02'
describe('session form', () => {
  const schema = sessionFormSchema(TODAY)
  it('rejects future dates, empty entries and >24h', () => {
    expect(schema.safeParse({ ...blankSession(TODAY), minutes: 30, session_date: '2026-11-03' }).success).toBe(false)
    expect(schema.safeParse({ ...blankSession(TODAY) }).success).toBe(false)
    expect(schema.safeParse({ ...blankSession(TODAY), minutes: 1441 }).success).toBe(false)
    expect(schema.safeParse({ ...blankSession(TODAY), minutes: 0, problems_solved: 2 }).success).toBe(true)
  })
  it('produces payloads the database accepts (new and edit)', () => {
    const v = schema.parse({ ...blankSession(TODAY), minutes: '45', notes: 'ch 4' })
    const created = sessionFormToPayload(v, { goal_id: null, topic_id: null }, false, '2026-11-02T10:00:00Z')
    expect(created).toMatchObject({ duration_seconds: 2700, source: 'manual', status: 'completed' })
    expect(insertSchemas.study_sessions.safeParse(created).success).toBe(true)
    const edited = sessionFormToPayload(v, { goal_id: null, topic_id: null }, true)
    expect('source' in edited).toBe(false)
    expect(updateSchemas.study_sessions.safeParse(edited).success).toBe(true)
    expect(sessionToForm({ goal_id: 'g', session_date: TODAY, duration_seconds: 2700, problems_solved: 1 }).target).toBe('g:g')
  })
})
describe('learning goal + topic forms', () => {
  it('validates and maps', () => {
    expect(learningGoalFormSchema.safeParse(blankLearningGoal()).success).toBe(false)
    const tid = crypto.randomUUID()
    const v = learningGoalFormSchema.parse({ ...blankLearningGoal(), title: 'React', topic_id: tid, target_hours: '1.5' })
    const p = learningGoalToPayload(v, [{ id: tid, group_name: 'Frontend' }])
    expect(p).toMatchObject({ target_minutes: 90, category: 'Frontend', topic_id: tid })
    expect(insertSchemas.goals.safeParse(p).success).toBe(true)
    expect(learningGoalToPayload(learningGoalFormSchema.parse({ ...blankLearningGoal(), title: 'x' }), [])).toMatchObject({ topic_id: null, category: 'Learning' })
  })
  it('topic payload carries parsed revision dates', () => {
    const v = topicFormSchema.parse({ ...blankTopic('Frontend'), name: 'Hooks' })
    expect(insertSchemas.learning_topics.safeParse(topicToPayload(v, ['2026-11-09'])).success).toBe(true)
    expect(topicFormSchema.safeParse(blankTopic('Frontend')).success).toBe(false)
  })
})
describe('goal + milestone forms', () => {
  it('requires a title and ordered dates; payload is valid', () => {
    expect(goalFormSchema.safeParse(blankGoal(TODAY)).success).toBe(false)
    expect(goalFormSchema.safeParse({ ...blankGoal('2026-11-10'), title: 'x', due_date: '2026-11-01' }).success).toBe(false)
    const v = goalFormSchema.parse({ ...blankGoal(TODAY), title: ' Ship it ', due_date: '2026-12-01', target_hours: '10', manual_progress: '25' })
    const p = goalToPayload(v)
    expect(p).toMatchObject({ title: 'Ship it', target_minutes: 600, manual_progress: 25 })
    expect(insertSchemas.goals.safeParse(p).success).toBe(true)
    expect(goalToForm({ title: 'a', category: 'Personal', period: 'weekly', target_minutes: 90 }).target_hours).toBe(1.5)
    expect(goalFormSchema.safeParse({ ...blankGoal(), title: 'x', manual_progress: 101 }).success).toBe(false)
  })
  it('validates milestones', () => {
    expect(milestoneFormSchema.safeParse({ title: '  ', due_date: '' }).success).toBe(false)
    expect(milestoneFormSchema.safeParse({ title: 'a', due_date: '2026-02-30' }).success).toBe(false)
    expect(insertSchemas.milestones.safeParse({ goal_id: crypto.randomUUID(), title: 'a', due_date: null, position: 0 }).success).toBe(true)
  })
})
