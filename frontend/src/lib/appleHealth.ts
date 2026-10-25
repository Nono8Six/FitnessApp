import type { WorkoutExport } from './workoutExport'
export { workoutExportIssue as appleExportIssue, workoutExport as appleWorkout } from './workoutExport.ts'

export const APPLE_SHORTCUT_NAME = 'Fitness vers Santé'

export type AppleWorkout = WorkoutExport

export function appleShortcutUrl(workout: AppleWorkout): string {
  return `shortcuts://run-shortcut?name=${encodeURIComponent(APPLE_SHORTCUT_NAME)}&input=text&text=${encodeURIComponent(JSON.stringify(workout))}`
}
