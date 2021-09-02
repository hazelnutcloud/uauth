import React from 'react'
import Button from '../components/LoginButton'
import uauth from '../uauth'
import './index.css'
import SmallButton from './SmallButton'

interface Props {
  small?: boolean
}

const Widget: React.FC<Props> = ({small = false}) => {
  const handleButtonClick: React.MouseEventHandler<HTMLButtonElement> = e => {
    ;(async () => {
      await uauth.login({
        beforeRedirect(options, url) {
          // console.log(window.localStorage.getItem('openid-configuration'))
          alert('Redirecting to ' + url)
        },
      })
    })()
  }

  return (
    <div className="Widget">
      {small ? (
        <SmallButton onClick={handleButtonClick} />
      ) : (
        <Button onClick={handleButtonClick} />
      )}
    </div>
  )
}

export default Widget
