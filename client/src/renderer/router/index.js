import { createRouter, createWebHistory, createWebHashHistory } from 'vue-router'
import { isAuthenticated, getAuth } from '../../../../common/auth/auth.js'
import { SessionStore } from '../../session-store'
import OauthRedirectComponent from '../components/OauthRedirectComponent.vue'
import LoginComponent from '../components/LoginComponent.vue'
import ConnectingComponent from '../components/ConnectingComponent.vue'
import RestComponent from '../components/RestComponent.vue'
import SetupComponent from '../components/SetupComponent.vue'
import DummyComponent from '../components/DummyComponent.vue'

const noAuthRoutes = ['/signin', '/login/index.html', '/setup', '/', '/index.html']

const routes = [
  { path: '/dummy', component: DummyComponent },
  { path: '/login/index.html', component: OauthRedirectComponent }, // to match the oauth redirect we get
  { path: '/signin', component: LoginComponent, name: 'signin', props: true },
  { path: '/rest', component: RestComponent },
  { path: '/setup', component: SetupComponent },
  { path: '/current-stage', beforeEnter: earningsOrSetup, component: DummyComponent },
  {
    path: '/',
    name: 'landing-page',
    component: ConnectingComponent,
  }
]

const router = createRouter({
  history: process.env.IS_ELECTRON ? createWebHashHistory() : createWebHistory(),
  routes: routes
})

function earningsOrSetup() {
  // no-auth check to see if they've even started assignment to condition
  if (window.localStorage.getItem('MindBody.isAssignedToCondition') !== 'true') {
      return {path: '/setup'}
  }
  // if they've at least been assigned to condition, they need to log in
  // for us to be able to show the streak page
  if (!isAuthenticated()) {
      return { name: 'signin', query: { postLoginPath: '/dummy' }}
  }

  return {path: '/dummy'}
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

window.mainAPI.onShowRestBreathing(() => {
  router.push({path: '/rest'})
})

export default router
