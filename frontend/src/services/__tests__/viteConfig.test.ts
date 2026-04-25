import configFactory from '../../../vite.config'

describe('vite chunk configuration', () => {
  it('keeps axios out of app chunks so auth services do not evaluate through a circular entry chunk', () => {
    const config =
      typeof configFactory === 'function'
        ? configFactory({
            command: 'build',
            mode: 'production',
            isSsrBuild: false,
            isPreview: false,
          })
        : configFactory

    const groups =
      config.build?.rolldownOptions?.output?.codeSplitting?.groups ?? []

    expect(groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'axios',
          test: expect.any(RegExp),
        }),
      ])
    )

    const axiosGroup = groups.find((group) => group.name === 'axios')
    expect(axiosGroup?.test.test('node_modules/axios/index.js')).toBe(true)
  })

  it('keeps RTK Query API slices out of the app entry chunk so baseQuery is initialized before use', () => {
    const config =
      typeof configFactory === 'function'
        ? configFactory({
            command: 'build',
            mode: 'production',
            isSsrBuild: false,
            isPreview: false,
          })
        : configFactory

    const groups =
      config.build?.rolldownOptions?.output?.codeSplitting?.groups ?? []

    expect(groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'rtk-api',
          test: expect.any(RegExp),
        }),
      ])
    )

    const rtkApiGroup = groups.find((group) => group.name === 'rtk-api')
    expect(rtkApiGroup?.test.test('/home/blur/erp2/frontend/src/store/api/searchApi.ts')).toBe(true)
    expect(rtkApiGroup?.test.test('/home/blur/erp2/frontend/src/store/api/baseQuery.ts')).toBe(true)
  })

  it('keeps redux persistence dependencies out of the app entry chunk so persist actions have a type', () => {
    const config =
      typeof configFactory === 'function'
        ? configFactory({
            command: 'build',
            mode: 'production',
            isSsrBuild: false,
            isPreview: false,
          })
        : configFactory

    const groups =
      config.build?.rolldownOptions?.output?.codeSplitting?.groups ?? []

    const reduxGroup = groups.find((group) => group.name === 'redux')
    expect(reduxGroup?.test.test('node_modules/redux-persist/es/persistStore.js')).toBe(true)
    expect(reduxGroup?.test.test('node_modules/redux/src/createStore.ts')).toBe(true)
  })
})
