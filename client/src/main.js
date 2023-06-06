import { createApp } from 'vue'

import App from './renderer/App'
import router from './renderer/router'

/* eslint-disable no-new */
const app = createApp(App)
app.use(router)
app.mount('#app')

