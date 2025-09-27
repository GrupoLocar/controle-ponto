module.exports = {
    apps: [{
      name: "controle-ponto",
      script: "server.js",
      cwd: "C:/controle-ponto",
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: "3001"
      }
    }]
  }
  