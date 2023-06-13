const path = require('path')
module.exports = {
  configureWebpack: config => {
    config.externals = {
        'better-sqlite3': 'commonjs better-sqlite3'
    }
  },
  pluginOptions: {
    electronBuilder: {
      chainWebpackMainProcess: config => {
        config.module
          .rule('supportChaining')
          .test(/\.js$/)
            .include
              .add(path.resolve('node_modules/@aws-sdk'))
              .end()
          .use('babel-loader')
            .loader('babel-loader')
            .tap(options => ({ ...options, 
              plugins : ['@babel/plugin-transform-optional-chaining']
            }))
            .end()
      },
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
      preload: 'src/preload.js',
      externals: [ 'better-sqlite3' ]
    }
  }
}