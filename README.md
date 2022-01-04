类似的模块已经很多，只是通过造轮子，熟悉npm模块的发布流程

## 项目地址
- 国内 <https://npm.taobao.org/package/less2er>
- 国外 <https://www.npmjs.com/package/less2er>

## 介绍
监控并转化less到css

## 注意
- 尽量升级全局less到最新版本（>@3.0）
- 发现在某些win10机器上使用系统cmd执行 less2er后，仅编译一次，修改文件后再不会触发编译的情况。通过排查是发现是 ```fs.watch(filePath，callback)``` 无法触发callback。但是使用webstorm、cmder等第三方命令行工具执行却正常。该问题暂时无解。
- 除了windows10，其他平台未测试过

## 特性
- 零依赖,瞬间安装
- 支持0配置运行，默认会扫描当前目录下的css、style、less目录


## 计划
- [ ] 增、删less文件，无法感知到
- [ ] 增加lessc的所有自定义配置，做到简单、灵活
- [ ] 在这里提交你们需要的功能 <https://github.com/ccwq/less2er/issues>
- [x] 增加节流，去除无效编译
- [x] 启动时默认进行一次编译
- [x] 修复全局调用时，有中文路径报错的问题
- [x] 执行时会检测是否安装全局less模块,若果发现未安装，会自动执行一次```npm i -g less```,完成后继续编译。

## 安装

```bash
npm install -g less2er
```


## 使用

- 0配置运行
```bash
less2er 
```

- 自定义less路径
```bash
less2er --path=path/to/your/less
```
