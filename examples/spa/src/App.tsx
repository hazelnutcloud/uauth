import UAuth from '@uauth/js'
import '@uauth/modal/src/Modal.css'
import Resolution from '@unstoppabledomains/resolution'
import React, {useEffect, useState} from 'react'
import {
  BrowserRouter,
  Redirect,
  Route,
  RouteProps,
  Switch,
} from 'react-router-dom'
const appUri = 'http://localhost:5000'

const uauth = new UAuth({
  clientID: process.env.REACT_APP_CLIENT_ID,
  clientSecret: process.env.REACT_APP_CLIENT_SECRET,
  scope: 'openid email wallet example',
  redirectUri: appUri + '/callback',
  postLogoutRedirectUri: appUri, // + '/login',
  fallbackIssuer: process.env.REACT_APP_FALLBACK_ISSUER,
  resolution: new Resolution(),
  cacheOptions: {
    // userinfo: false,
    // issuer: false,
  },
})

const Home: React.FC<RouteProps> = props => {
  const [redirectTo, setRedirectTo] = useState<string>()

  useEffect(() => {
    // Try to access the id_token inside `window.localStorage`
    uauth
      .user()
      // User is inside cache, redirect to the profile page.
      .then(user => {
        console.log('user ->', user)
        setRedirectTo('/profile')
      })
      // User is not inside cache, redirect to the login page.
      .catch(error => {
        console.error(error)
        setRedirectTo('/login')
      })
  }, [])

  if (redirectTo) {
    return <Redirect to={redirectTo} />
  }

  return <>Loading...</>
}

const Login: React.FC<RouteProps> = props => {
  const [errorMessage, setErrorMessage] = useState<string | null>(
    new URLSearchParams(props.location?.search || '').get('error'),
  )

  const handleLoginButtonClick: React.MouseEventHandler<HTMLButtonElement> =
    e => {
      setErrorMessage(null)
      uauth.login().catch(error => {
        console.error('login error:', error)
        setErrorMessage('User failed to login.')
      })
    }

  return (
    <>
      {errorMessage && <div>{errorMessage}</div>}
      <button onClick={handleLoginButtonClick}>Login with Unstoppable</button>
    </>
  )
}

const Callback: React.FC<RouteProps> = props => {
  const [redirectTo, setRedirectTo] = useState<string>()

  useEffect(() => {
    // Try to exchange authorization code for access and id tokens.
    uauth
      .loginCallback()
      // Successfully logged and cached user in `window.localStorage`
      .then(response => {
        console.log('loginCallback ->', response)
        setRedirectTo('/profile')
      })
      // Failed to exchange authorization code for token.
      .catch(error => {
        console.error('callback error:', error)
        setRedirectTo('/login?error=' + error.message)
      })
  }, [])

  if (redirectTo) {
    return <Redirect to={redirectTo} />
  }

  return <>Loading...</>
}

const Profile: React.FC<RouteProps> = () => {
  const [user, setUser] = useState<any>()
  const [loading, setLoading] = useState(false)
  const [redirectTo, setRedirectTo] = useState<string>()

  useEffect(() => {
    uauth
      .user()
      .then(setUser)
      .catch(error => {
        console.error('profile error:', error)
        setRedirectTo('/login?error=' + error.message)
      })
  }, [])

  const handleLogoutButtonClick: React.MouseEventHandler<HTMLButtonElement> =
    e => {
      console.log('logging out!')
      setLoading(true)
      uauth
        .logout({
          beforeRedirect(options: any, url: string) {
            // alert(url)
          },
        })
        .catch(error => {
          console.error('profile error:', error)
          setLoading(false)
        })
    }

  if (redirectTo) {
    return <Redirect to={redirectTo} />
  }

  if (!user || loading) {
    return <>Loading...</>
  }

  return (
    <>
      <pre>{JSON.stringify(user, null, 2)}</pre>
      <button onClick={handleLogoutButtonClick}>Logout</button>
    </>
  )
}

const App: React.FC = () => {
  return (
    <>
      <BrowserRouter>
        <Switch>
          <Route path="/login" component={Login} />
          <Route path="/callback" component={Callback} />
          <Route path="/profile" component={Profile} />
          <Route path="/" component={Home} />
        </Switch>
      </BrowserRouter>
    </>
  )
}

export default App
