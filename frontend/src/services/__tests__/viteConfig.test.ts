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
})
