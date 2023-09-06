import { createRouter, createWebHistory, createWebHashHistory } from 'vue-router'
import { isAuthenticated, getAuth } from '../../../../common/auth/auth.js'
import { SessionStore } from '../../session-store'
import EarningsComponent from '../components/EarningsComponent.vue'
import OauthRedirectComponent from '../components/OauthRedirectComponent.vue'
import LoginComponent from '../components/LoginComponent.vue'
import ConnectingComponent from '../components/ConnectingComponent.vue'
import SetupComponent from '../components/SetupComponent.vue'
import TrainingComponent from '../components/TrainingComponent.vue'
import LabVisit2Component from '../components/LabVisit2Component.vue'

const noAuthRoutes = ['/signin', '/login/index.html', '/setup', '/', '/index.html']

const routes = [
  { path: '/login/index.html', component: OauthRedirectComponent }, // to match the oauth redirect we get
  { path: '/signin', component: LoginComponent, name: 'signin', props: true },
  { path: '/setup', name: 'setup', component: SetupComponent },
  { path: '/earnings', name: 'earnings', component: EarningsComponent },
  { path: '/current-stage', beforeEnter: earningsOrSetup, component: EarningsComponent },
  {
    path: '/',
    name: 'landing-page',
    component: ConnectingComponent,
  },
  { path: '/training', component: TrainingComponent },
  { path: '/visit2', component: LabVisit2Component }
]

const router = createRouter({
  history: process.env.IS_ELECTRON ? createWebHashHistory() : createWebHistory(),
  routes: routes
})

async function earningsOrSetup() {
  if (await window.mainAPI.getKeyValue('isAssignedToCondition') !== 'true') {
    return { name: 'setup' }
  }
  return {path: '/earnings'}
}

// use navigation guards to handle authentication
router.beforeEach(async (to) => {
  if (!isAuthenticated() && !noAuthRoutes.includes(to.path)) {
    return { name: 'signin', query: { 'postLoginPath': to.path } }
  }

  const sess = await SessionStore.getRendererSession()
  if (isAuthenticated() && !sess) {
    const cognitoAuth = getAuth()
    cognitoAuth.userhandler = {
      onSuccess: session => {
        window.mainAPI.loginSucceeded(session)
        SessionStore.session = session
      },
      onFailure: err => console.error(err)
    }
    cognitoAuth.getSession()
  }

  return true
})

window.mainAPI.onShowEarnings(() => {
  router.push({path: '/earnings'});
})

window.mainAPI.onShowTasks(() => {
  router.push({path: '/training'});
})

export default router
