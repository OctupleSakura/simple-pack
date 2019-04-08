const fs = require('fs')
const path = require('path')
const babylon = require('babylon')
//遍历节点的插件
const traverse = require('babel-traverse').default

//babel-core是用来转码的插件
const { transformFromAst } = require('babel-core')

//生成每个模块时的自增id
let ID = 0

//生成依赖图
const graph = createGraph('./example/entry')
//输出
const result = bundle(graph)

console.log(result)

//返回所依赖的所有模块的数组
function createGraph(filename) {
  //传一个路径，注意是从根目录开始
  const mainAssest = createAsset(filename)

  //模块队列
  const queue = [mainAssest]

  for(const asset of queue) {

    asset.mapping = {}
    //标准化拿到的文件路径
    const dirname = path.dirname(asset.filename)

    //循环模块依赖并添加到队列
    asset.dependencies.forEach(childPath => {

      const absolutePath = path.join(dirname, childPath)

      //生成子级模块和依赖
      const child = createAsset(absolutePath)

      asset.mapping[childPath] = child.id

      queue.push(child)

    })
  }

  return queue

}

//单个文件的 解析, 和依赖结构返回
function createAsset(filename) {
   const dependencies = [];
   //拿到文件
   //做了一个处理，正则匹配末尾，如果没有拓展名就加上js的拓展名
   const content = fs.readFileSync( /.js$/.test(filename) ? filename : filename + '.js', 'utf-8')
   const ast = babylon.parse(content, {
     sourceType: 'module'
   })
  
   traverse(ast, {
    //寻找import声明
    ImportDeclaration: ({node}) => {
      dependencies.push(node.source.value)
    }
   })
  
   //给模块添加id
   const id = ID++
   
   //解析ast 用babel-preset-env转换成兼容性的code
   const { code } = transformFromAst(ast, null, {
     presets: ['env']
   })
   
   //返回模块id, 文件路径， 模块依赖的所有模块，模块转换后的代码
   return {
    id,
    filename,
    dependencies,
    code,
  }
}

//最终输出
function bundle(graph) {

  //作为传到主体自执行函数的参数
  let modules = ''
  
  //转换过后使用common.js的模式，并且每个模块之间互不污染，因此我们给每一个模块扔到一个函数之中，并且手动实现一个简单的模块系统
  graph.forEach(mod => {
    modules += `${mod.id}: [
      function (require, module, exports) {
        ${mod.code}
      },
      ${JSON.stringify(mod.mapping)}
    ]`
  })
  //这里的require函数接受一个id，并且通过这个id找到对应的module
  //初始化执行require(0)，第一个模块id必定为0
  //在这里实现一个简单的模块系统并且方法作为参数扔到modules的fn中
  //实际上这里也很巧妙的利用了递归
  const main = `
   (function (modules) {
     function require(id) {

       const [fn, mapping] = modules[id]

       function localRequire(path) {
         return require(mapping[path])
       }

       const module = { exports: {} }

       fn(localRequire, module, module.exports)
       
       return module.exports
     }
     require(0)
   })(${modules})
  `

  return main

}