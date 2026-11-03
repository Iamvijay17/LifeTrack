export const DEFAULT_TOPICS = {
  Frontend: ['JavaScript', 'React', 'TypeScript', 'Redux', 'HTML/CSS'],
  Backend: ['Node.js', 'Express', 'Java', 'Spring Boot', 'SQL'],
  DSA: ['Arrays', 'Strings', 'Linked Lists', 'Trees', 'Graphs', 'Dynamic Programming'],
  AI: ['LLMs', 'RAG', 'AI integrations', 'AI application development'],
  Projects: ['Portfolio', 'Vireon-AI', 'Other personal projects'],
}
export const TOPIC_GROUPS = Object.keys(DEFAULT_TOPICS)

export const DEFAULT_EXERCISES = [
  ['Barbell Squat', 'Legs', 'Barbell'],
  ['Deadlift', 'Back', 'Barbell'],
  ['Bench Press', 'Chest', 'Barbell'],
  ['Overhead Press', 'Shoulders', 'Barbell'],
  ['Barbell Row', 'Back', 'Barbell'],
  ['Pull-up', 'Back', 'Bodyweight'],
  ['Push-up', 'Chest', 'Bodyweight'],
  ['Dip', 'Triceps', 'Bodyweight'],
  ['Incline Dumbbell Press', 'Chest', 'Dumbbell'],
  ['Dumbbell Curl', 'Biceps', 'Dumbbell'],
  ['Hammer Curl', 'Biceps', 'Dumbbell'],
  ['Lateral Raise', 'Shoulders', 'Dumbbell'],
  ['Tricep Pushdown', 'Triceps', 'Cable'],
  ['Lat Pulldown', 'Back', 'Cable'],
  ['Seated Cable Row', 'Back', 'Cable'],
  ['Leg Press', 'Legs', 'Machine'],
  ['Leg Curl', 'Legs', 'Machine'],
  ['Leg Extension', 'Legs', 'Machine'],
  ['Romanian Deadlift', 'Legs', 'Barbell'],
  ['Lunge', 'Legs', 'Dumbbell'],
  ['Calf Raise', 'Legs', 'Machine'],
  ['Plank', 'Core', 'Bodyweight'],
  ['Crunch', 'Core', 'Bodyweight'],
  ['Hanging Leg Raise', 'Core', 'Bodyweight'],
  ['Face Pull', 'Shoulders', 'Cable'],
  ['Chest Fly', 'Chest', 'Cable'],
]
export const MUSCLE_GROUPS = ['Chest', 'Back', 'Legs', 'Shoulders', 'Biceps', 'Triceps', 'Core', 'Cardio', 'Full body']

export const TASK_CATEGORIES = ['Learning', 'Job Search', 'Gym', 'Health', 'Personal', 'Finance']
export const PRIORITIES = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]
export const APPLICATION_SOURCES = ['LinkedIn', 'Naukri', 'Indeed', 'Company site', 'Referral', 'Recruiter', 'Other']
