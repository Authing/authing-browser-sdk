const execa = require('execa')

readyGo()

function readyGo () {
  execa(
    'rollup',
    [
      '-c'
    ],
    { stdio: 'inherit' }
  )
}
