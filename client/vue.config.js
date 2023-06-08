module.exports = {
  pluginOptions: {
    electronBuilder: {
      builderOptions: {
        appId: "lipbelly",
        productName: "USC Mind-Body Study",
        extraFiles: [
          {
            from: 'src/powershell/hide-emwave.ps1',
            to: 'hide-emwave.ps1'
          }
      ],
      },
      nodeIntegration: false,
      preload: 'src/preload.js'
    }
  }
}