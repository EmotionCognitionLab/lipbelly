module.exports = {
  pluginOptions: {
    electronBuilder: {
      builderOptions: {
        appId: "lipbelly",
        productName: "USC Mind-Body Study"
      },
      nodeIntegration: false,
      preload: 'src/preload.js'
    }
  }
}