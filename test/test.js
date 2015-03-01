var transfo = require("../index.js")
transfo(require("fs").readFileSync("./test.jsxz"),
{parserOptions: {tabWidth: 2}}
,function(res,files){
  console.log(files)
  console.log(res.code)
  console.log(res)
})
