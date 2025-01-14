/* eslint-disable @typescript-eslint/ban-ts-comment */
import {StaticJsonRpcProvider} from '@ethersproject/providers'
import type UAuth from '@uauth/js'
import type {UAuthConstructorOptions, UserInfo} from '@uauth/js'
import type {IWalletConnectProviderOptions} from '@walletconnect/types'
import {
  WalletInit,
  createEIP1193Provider,
  EIP1193Provider,
  Chain,
  ProviderAccounts,
  ProviderRpcError,
  ProviderRpcErrorCode,
} from '@web3-onboard/common'

export interface ConstructorOptions {
  uauth: UAuth
  shouldLoginWithRedirect?: boolean
  walletconnect: IWalletConnectProviderOptions
}

export default function uauthBNCModule(
  options: ConstructorOptions,
): WalletInit {
  return () => {
    return {
      label: 'Unstoppable',
      getIcon: async () =>
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M22.7319 2.06934V9.87229L0 19.094L22.7319 2.06934Z" fill="#2FE9FF"/><path fill-rule="evenodd" clip-rule="evenodd" d="M18.4696 1.71387V15.1917C18.4696 19.1094 15.2892 22.2853 11.3659 22.2853C7.44265 22.2853 4.26221 19.1094 4.26221 15.1917V9.51682L8.52443 7.17594V15.1917C8.52443 16.5629 9.63759 17.6745 11.0107 17.6745C12.3839 17.6745 13.497 16.5629 13.497 15.1917V4.4449L18.4696 1.71387Z" fill="#4C47F7"/></svg>',
      getInterface: async ({chains, EventEmitter}) => {
        const uauth = options.uauth
        if (uauth == null) {
          throw new Error(
            'Must import UAuth before constructing a UAuth Object',
          )
        }
        let user: UserInfo
        try {
          user = await uauth.user()
        } catch (error) {
          if (!uauth.fallbackLoginOptions.scope.includes('wallet')) {
            throw new Error(
              'Must request the "wallet" scope for connector to work.',
            )
          }

          if (options.shouldLoginWithRedirect) {
            await uauth.login()

            // NOTE: We don't want to throw because the page will take some time to
            // load the redirect page.
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            await new Promise<void>(() => {})
            // We need to throw here otherwise typescript won't know that user isn't null.
            throw new Error('Should never get here.')
          } else {
            await uauth.loginWithPopup()
            user = await uauth.user()
          }
        }
        if (!user.wallet_type_hint) {
          throw new Error('no wallet type hint')
        }
        let provider
        if (['web3', 'injected'].includes(user.wallet_type_hint)) {
          provider =
            (window as any).ethereum ||
            ((window as any).web3 && (window as any).web3.currentProvider)
          provider = createEIP1193Provider(provider)
        } else if (user.wallet_type_hint === 'walletconnect') {
          const {
            bridge = 'https://bridge.walletconnect.org',
            qrcodeModalOptions,
          } = options.walletconnect || {}
          const {default: WalletConnect} = await import('@walletconnect/client')
          const {StaticJsonRpcProvider} = await import(
            '@ethersproject/providers'
          )

          const {default: QRCodeModal} = await import(
            '@walletconnect/qrcode-modal'
          )

          const {default: RxModules} = await import('rxjs')
          const {takeUntil, take, Subject, fromEvent} = RxModules

          const connector = new WalletConnect({
            bridge,
          })

          const emitter = new EventEmitter()
          class EthProvider {
            public request: EIP1193Provider['request']
            public connector: InstanceType<typeof WalletConnect>
            public chains: Chain[]
            public disconnect: EIP1193Provider['disconnect']
            // @ts-ignore
            public emit: typeof EventEmitter['emit']
            // @ts-ignore
            public on: typeof EventEmitter['on']
            // @ts-ignore
            public removeListener: typeof EventEmitter['removeListener']

            private disconnected$: InstanceType<typeof Subject>
            private providers: Record<string, StaticJsonRpcProvider>

            constructor({
              connector,
              chains,
            }: {
              connector: InstanceType<typeof WalletConnect>
              chains: Chain[]
            }) {
              this.emit = emitter.emit.bind(emitter)
              this.on = emitter.on.bind(emitter)
              this.removeListener = emitter.removeListener.bind(emitter)
              this.connector = connector
              this.chains = chains
              this.disconnected$ = new Subject()
              this.providers = {}

              // @ts-ignore listen for session updates
              fromEvent(this.connector, 'session_update', (error, payload) => {
                if (error) {
                  throw error
                }

                return payload
              })
                .pipe(takeUntil(this.disconnected$))
                .subscribe({
                  next: ({params}) => {
                    const [{accounts, chainId}] = params
                    this.emit('accountsChanged', accounts)
                    this.emit('chainChanged', `0x${chainId.toString(16)}`)
                  },
                  error: console.warn,
                })

              // @ts-ignore listen for disconnect event
              fromEvent(this.connector, 'disconnect', (error, payload) => {
                if (error) {
                  throw error
                }

                return payload
              })
                .pipe(takeUntil(this.disconnected$))
                .subscribe({
                  next: () => {
                    this.emit('accountsChanged', [])
                    this.disconnected$.next(true)
                    typeof localStorage !== 'undefined' &&
                      localStorage.removeItem('walletconnect')
                  },
                  error: console.warn,
                })
              this.disconnect = () => this.connector.killSession()

              this.request = async ({method, params}) => {
                if (method === 'eth_chainId') {
                  return `0x${this.connector.chainId.toString(16)}`
                }

                if (method === 'eth_requestAccounts') {
                  return new Promise<ProviderAccounts>((resolve, reject) => {
                    // Check if connection is already established
                    if (!this.connector.connected) {
                      // create new session
                      this.connector.createSession().then(() => {
                        QRCodeModal.open(
                          this.connector.uri,
                          () =>
                            reject(
                              new ProviderRpcError({
                                code: 4001,
                                message: 'User rejected the request.',
                              }),
                            ),
                          qrcodeModalOptions,
                        )
                      })
                    } else {
                      const {accounts, chainId} = this.connector.session
                      this.emit('chainChanged', `0x${chainId.toString(16)}`)
                      return resolve(accounts)
                    }

                    // @ts-ignore Subscribe to connection events
                    fromEvent(this.connector, 'connect', (error, payload) => {
                      if (error) {
                        throw error
                      }

                      return payload
                    })
                      .pipe(take(1))
                      .subscribe({
                        next: ({params}) => {
                          const [{accounts, chainId}] = params
                          this.emit('accountsChanged', accounts)
                          this.emit('chainChanged', `0x${chainId.toString(16)}`)
                          QRCodeModal.close()
                          resolve(accounts)
                        },
                        error: reject,
                      })
                  })
                }

                if (
                  method === 'wallet_switchEthereumChain' ||
                  method === 'eth_selectAccounts'
                ) {
                  throw new ProviderRpcError({
                    code: ProviderRpcErrorCode.UNSUPPORTED_METHOD,
                    message: `The Provider does not support the requested method: ${method}`,
                  })
                }

                // @ts-ignore
                if (method === 'eth_sendTransaction') {
                  // @ts-ignore
                  return this.connector.sendTransaction(params[0])
                }

                // @ts-ignore
                if (method === 'eth_signTransaction') {
                  // @ts-ignore
                  return this.connector.signTransaction(params[0])
                }

                // @ts-ignore
                if (method === 'personal_sign') {
                  // @ts-ignore
                  return this.connector.signPersonalMessage(params)
                }

                // @ts-ignore
                if (method === 'eth_sign') {
                  // @ts-ignore
                  return this.connector.signMessage(params)
                }

                // @ts-ignore
                if (method === 'eth_signTypedData') {
                  // @ts-ignore
                  return this.connector.signTypedData(params)
                }

                if (method === 'eth_accounts') {
                  return this.connector.sendCustomRequest({
                    id: 1337,
                    jsonrpc: '2.0',
                    method,
                    params,
                  })
                }

                const chainId = await this.request({method: 'eth_chainId'})
                if (!this.providers[chainId]) {
                  const currentChain = chains.find(({id}) => id === chainId)

                  if (!currentChain) {
                    throw new ProviderRpcError({
                      code: ProviderRpcErrorCode.CHAIN_NOT_ADDED,
                      message: `The Provider does not have a rpcUrl to make a request for the requested method: ${method}`,
                    })
                  }

                  this.providers[chainId] = new StaticJsonRpcProvider(
                    currentChain.rpcUrl,
                  )
                }

                return this.providers[chainId].send(
                  method,
                  // @ts-ignore
                  params,
                )
              }
            }
          }
          provider = new EthProvider({chains, connector})
        }
        return {provider: provider}
      },
    }
  }
}
