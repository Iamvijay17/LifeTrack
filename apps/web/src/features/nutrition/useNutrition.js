import { useMemo } from 'react'
import { STARTER_FOODS } from '@lifetrack/constants/foods'
import { useTables } from '@/hooks/store'
import { buildCatalog, goalsOf, liveFavorites } from '@/domain/nutrition'

/** Everything the Food & Nutrition page reads: the logs, the food catalogue (starter list + the user's own), targets and favourites. */
export function useNutrition() {
  const { data, loading, error, refetch } = useTables('food_logs', 'foods', 'water_logs', 'nutrition_settings', 'health_logs')
  const catalog = useMemo(() => buildCatalog(data.foods, STARTER_FOODS), [data.foods])
  const settingsRow = data.nutrition_settings[0] ?? null
  const goals = useMemo(() => goalsOf(settingsRow), [settingsRow])
  const favorites = useMemo(() => liveFavorites(settingsRow?.favorite_foods ?? [], catalog), [settingsRow, catalog])
  return {
    logs: data.food_logs,
    foods: data.foods,
    waterLogs: data.water_logs,
    healthLogs: data.health_logs,
    catalog,
    goals,
    favorites,
    settingsRow,
    loading,
    error,
    refetch,
  }
}
