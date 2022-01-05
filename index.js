#!/usr/bin/env node
var fs = require("fs");
var exec = require('child_process').exec;
var path = require("path");
var _root = process.cwd();
const argv = require('yargs').argv;
const glob = require('glob');
const Promise = require("bluebird")
const request = require('request');
const http = require("request");
const del = require('del');


const puppeteer = require('puppeteer');
const getExtension = require('content-type-to-ext').getExtension;


const replaceAll = function (find, replace, str) {
    var find = find.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    return str.replace(new RegExp(find, 'g'), replace);
}


const ASSETS_DIR_NAME = "assets";

mdImageFixer();



async function mdImageFixer() {
    const srcdir = argv._[0] || argv.src;

    if (!srcdir) {
        console.error("请指定src, --src=path/src或者md-image-url-refactor path/src");
        return;
    }

    const src = path.resolve(srcdir+ "\\").replace(/\\/g, "/");
    const dist = path.resolve(argv.dist || (src.replace(/(.+)([\/\\]).+?\2?$/, "$1/") + "/dist")).replace(/\\/g, "/");

    const list = glob.sync(src + "/**/*.md");

    if (!list.length) {
        console.error("未查找到有效的md文件:" + src);
        return;
    }

    console.log("正在清空目标目录" + dist);
    del.sync([
        dist+"**"
    ], {force: true});
    console.log("删除完成");
    const IMAGE_REG_LIST = [
        {
            regex: /<img.+src=(["'])(.+?)\1/g,
            urlGroupIndex: 1,
        },
        {
            regex: /!\[.+\]\((.+)\)/g,
            urlGroupIndex: 1,
        }
    ];

    IMAGE_REG_LIST.forEach(el => {
        const matchReg = new RegExp(el.regex.source);
        el.matchReg = matchReg;
    })
    const downloadImageByPuppeteer = initPupeteer();

    //文件列表
    const fileObjList = [];

    const url2fileObjIndexMap = new Map();
    await Promise.map(
        list,
        (mpath, fileIndex) => {
            const fileObj = path.parse(mpath);
            fileObjList.push(fileObj);
            const content = fs.readFileSync(mpath, {encoding: "utf8"});
            fileObj.content = content;

            /**
             * @type {[string, index]}
             */
            const tmpUrlLs = [];
            fileObj.imageUrlList = [];

            //正则提取
            IMAGE_REG_LIST.forEach(({regex: reg}, index) => {

                //提取所有的image部分
                const ls = content.match(reg);
                if (ls?.length) {
                    tmpUrlLs.push(...ls.map(str => [str, index]));

                }
            })

            let returnPromise;


            //提取到了url
            if (tmpUrlLs.length) {
                //从提取到的image部分提取url并且下载
                returnPromise = Promise.map(tmpUrlLs, ([str, regIndex]) => {
                    const {matchReg, urlGroupIndex} = IMAGE_REG_LIST[regIndex] || {};

                    const matchRes = str.match(matchReg);
                    const url = matchRes[urlGroupIndex]
                    // regex.test(str);
                    // const url = RegExp[`$${urlGroupIndex}`];
                    url2fileObjIndexMap.set(url, fileIndex);
                    if (url.startsWith("http")) {
                        // return downloadImageByPuppeteer(url, "download/");
                        fileObj.imageUrlList.push(url);

                    } else {
                        //非http协议无需修改
                    }
                })

            } else {
                //直接复制过去
                returnPromise = Promise.resolve();
            }

            return returnPromise;
        }
    )

    const imageHtml = fileObjList
        .map(el=>el.imageUrlList)
        .flat()
        .filter(el=>el.trim())
        .map(el=>{
            return `<img src="${el}" />`
        }).join("\n");

    const html = `<!doctype html><html lang="en-US">
        <head>
          <meta charset="UTF-8">
          <title></title>
        </head>
        <body>
            ${imageHtml}
        </body>
    </html>`


    fs.writeFile("./tpl.html", html, function(err){
        if (err) {
            console.log(err);
        }
    });

    //加载所有图片
    let imageLs = await downloadImageByPuppeteer(
        path.resolve("./tpl.html"),
        dist+"/" + ASSETS_DIR_NAME
    );


    const url2imageObj = imageLs.reduce((result, imageObj)=>{
        const [success, imageUrl, fileSubPath, imageFileName] = imageObj;

        result[imageUrl] = imageObj;
        return result;
    }, {});


    //失败图片的列表
    const failImageList = [];

    //复制的列表
    const copyedLs = [];

    //替换的列表
    const fixedLs = [];

    fileObjList.forEach(fileObj=>{
        const {
            content,
            base: filename,
            imageUrlList,
        } = fileObj;
        let _content = content;

        //需要替换图片
        imageUrlList.forEach(imgu=>{
            const imageObj = url2imageObj[imgu]
            if (!imageObj) {
                failImageList.push(imgu);
                return;
            }
            const [success, imageUrl, fileSubPath, imageFileName] = imageObj;
            const localUrl = ASSETS_DIR_NAME + "/" + imageFileName;
            _content = replaceAll(imageUrl, localUrl, _content);
            // _content = _content.replace(new RegExp(imageUrl, "g"), ASSETS_DIR_NAME + "/" + imageFileName);
            // debugger;
        })


        if (_content != content) {
            fixedLs.push(filename);
            console.log("已经替换完成:",filename);
        }else{
            copyedLs.push(filename);
            console.log("已经复制完成:",filename);
        }

        fs.writeFileSync(
            dist+"/"+filename,
            _content,
            function(err){
                if (err) {
                    console.log(err);
                }else{
                    console.log("保存完成");
                }
            }
        )
    })

    console.log("处理完成--------------------------------------------------------");
    console.log("已经处理" + list.length + "个文件");
    console.log("图片下载失败列表:\n" + failImageList.join("\n"));
    console.log("复制的列表:\n=== " + copyedLs.join("\n=== "));
    console.log("解析的列表:\n--- " + fixedLs.join("\n--- "));

    if (!argv.debug) {
        del.sync("./tpl.html");
    }
    process.exit();
}


//有些资源会下载失败,比如简书的资源https://upload-images.jianshu.io/upload_images/1912618-e40813ee9a2748db.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240
function downloadFileAsync(uri, dest){
    return new Promise((resolve, reject)=>{
        // 确保dest路径存在
        const file = fs.createWriteStream(dest);

        const options = {
            method:"GET",
        }

        http.get(uri, options, (res)=>{
            if (!res) {
                reject("res为空")
                return;
            }
            if(res.statusCode !== 200){
                reject([res.statusCode, res.message]);
                return;
            }

            res.on('end', ()=>{
                console.log('download end');
            });

            // 进度、超时等

            file.on('finish', ()=>{
                console.log('finish write file')
                file.close(resolve);
            }).on('error', (err)=>{
                fs.unlink(dest);
                debugger;
                reject(err.message);
            })

            res.pipe(file);
        });
    });
}



function initPupeteer() {
    let browser, page, dest, pageLoadedCallback;
    const loadResultLs = [];
    let readyPromise =  new Promise(async (resolve, reject) => {
        browser = await puppeteer.launch({
            // headless: false,
            args:['--no-sandbox'],
            // userDataDir,
            defaultViewport: {
                width: 960,
                height: 780,
            }
        });
        page = await browser.newPage();
        let sequenceNo = 0;
        page.on('response', async response => {
            const url = response.url();
            const req = response.request();
            const respHeaders = response.headers();
            const contType = respHeaders["content-type"] || "";
            const ext = getExtension(contType)
            const resType = req.resourceType()
            const status = response.status();

            //重定向系列调用response.buffer报错
            if (status >= 300 && status <= 399) {
                loadResultLs.push([
                    false,
                    url,
                ]);
            }else{
                if (contType.startsWith("image") || resType === 'image') {
                    response.buffer().then(file => {
                        const fileName = `${Date.now()}-${sequenceNo++}.${ext}`;
                        const fileSubPath = `${dest}/${fileName}`;
                        const filePath = path.resolve(__dirname, fileSubPath);
                        const writeStream = fs.createWriteStream(filePath);
                        writeStream.write(file);
                        loadResultLs.push([
                            true,
                            url,
                            filePath,
                            fileName,
                        ])
                    }).catch(err=>{
                        console.error(err);
                    })
                }else{
                    loadResultLs.push([
                        false,
                        url,
                    ]);
                }
            }
        });


        page.on("load", function(){
            if (pageLoadedCallback) {

                //保证图片加载完成
                //直接resolve会有图片大小为0的情况
                setTimeout(__ => pageLoadedCallback(loadResultLs), 1500);
            }
        })
        resolve();
    })
    return async function(url, _dest) {
        dest = _dest;
        //目录不存在则自动创建
        if (!fs.existsSync(dest)){
            fs.mkdirSync(dest, { recursive: true });
        }
        const pageLoadedPromise = new Promise((resolve, reject) => {
            pageLoadedCallback = resolve;
        })
        await readyPromise;
        try {
            sequenceNo = 0;
            await page.goto(url);
            return await pageLoadedPromise;
        } catch (e) {
            console.log("下载失败:", url);
            console.log(e);
        }
    }
}


