import { app } from './app'
import { env } from './config/env'
import { flushNotifications } from './jobs/flushNotifications'

app.listen(env.PORT, () => {
  console.log(`Listening on port ${env.PORT}`)
})

setInterval(() => {
  flushNotifications().catch((err) => console.error('Notification flush failed', err))
}, env.NOTIFICATION_WINDOW_MS)

