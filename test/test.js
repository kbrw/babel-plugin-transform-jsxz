var transfo = require("../index.js")
transfo(require("fs").readFileSync("./test.jsxz"),
{parserOptions: {tabWidth: 2,sourceFileName: "source.js",sourceMapName: "map.json"}}
,function(err,res,files){
  console.log("error:")
  console.log(err)
  console.log("deps:")
  console.log(files)
  console.log("code:")
  console.log(res.code)
  console.log("result:")
  console.log(res)
})
