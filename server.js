const express = require('express');
const schedule = require('node-schedule');

const cheerio = require("cheerio")
const axios = require("axios")
const fs = require('node:fs/promises')

const crypto = require('crypto');
const server = express();

const unirest = require("unirest");

const  cors = require('cors');
server.use(express.json());
server.use(cors());

var admin = require("firebase-admin");


var serviceAccount = require(__dirname+"/serviceAccountKey.json");

admin.initializeApp({

  credential: admin.credential.cert(serviceAccount)

});


// server.get('/wallpaper' ,  async (req, res) => {

//     var url = req.query.url;
//     if(url == undefined) res.send('Uh Oh, bad url');
  
//     res.send(await getImageFromUrl(url));
// });


server.get('/forums', async(req, res) =>{
   

    if(req.query.id == undefined && req.query.action == null) return res.send('Error: No board specicified!');
  res.send(await getForums({
    'subboard' : req.query.id,
    'type': req.query.type,
    'action':  req.query.action,
    'show' :  ((req.query.page??1) - 1) * 50,
  }));
});


server.get('/news/recent', async(req, res) =>{
    const filters = req.query.filters;
   

  res.send(await getNews("https://myanimelist.net/news" , filters , req.query.page ??1));
});


server.get('/news/:tag', async(req, res) =>{
    const filters = req.query.filters;
   

  res.send(await getNews(`https://myanimelist.net/news/tag/${req.params.tag}` , filters, req.query.page ??1));
});

const getForums = async (query)=>{
    const axiosResponse = await axios.request({
        method: "GET",
        url: "https://myanimelist.net/forum",
        headers: {
            "User-Agent": getUserAgent(),
        },
        params: query,

    }); 
    const $ = cheerio.load(axiosResponse.data)


    const list = [];
    const dataList  =  $('#forumTopics').children().first().children();
    for(const element of dataList){
        const id = $(element).attr('data-topic-id');
        if(id != null){
            const firstRow = $(element).children().first().next();
            const title = firstRow.children().first().text();
            const url = `https://myanimelist.net${firstRow.children().first().attr('href')}`;
            const author = firstRow.find('.forum_postusername').children().first();
            const authorUsername= author.text().trim();
            const authorUrl = `https://myanimelist.net${author.attr('href')}`;
            const date = firstRow.find('.lightLink').text().trim();
            const dateObject = new Date(date);
 

            const secondRow = query.action != 'recent' ? firstRow.next(): firstRow.next().next();
            const comments = secondRow.text().trim();

            const thirdRow = secondRow.next();
            const lastCommentUsername = thirdRow.children().first().text();
            const lastCommentDate = thirdRow.get().at(-1).lastChild.data;
    
            const all = {
                mal_id: parseInt(id), 
                title: title,
                url: url, 
                author_username: authorUsername,
                author_url: authorUrl,
                date: dateObject,
                comments: parseInt(comments),
                last_comment:{
                    username: lastCommentUsername,
                    date: lastCommentDate
                },
                
            };


            if(query.action != undefined){
            
                const board = firstRow.next().children().first();
                const boardName = board.text();
                const boardUrl = board.attr('href');
                all['board'] = {
                    'name' : boardName,
                    'url' : boardUrl,
                };
            }else{
                const content = firstRow.find('.forum_postusername').prev().children().first();
                const contentName = content.text();

                const contentUrl = content.attr('href');
                const contentId = contentUrl.split('=').at(1);
                const contentType = contentUrl.split('=').at(0).split('?').at(1).replace('id' , '');
                all['entry'] = {
                    'name' : contentName,
                    'id': parseInt(contentId),
                    'type': contentType
                };
            }
            
        list.push(all);
        }
}

return list;
};

const getNews = async (url , filters , page)=>{
    const axiosResponse = await axios.request({
        method: "GET",
        url: url,

        headers: {
            "User-Agent": getUserAgent(),
        },
        params :{
            p: page
        }
    });

    const $ = cheerio.load(axiosResponse.data)

    var lastVisiblePage = $('.pagination').get().at(0).childNodes.at(-1);
    if(lastVisiblePage == undefined) lastVisiblePage = 1;
    else lastVisiblePage = parseInt(lastVisiblePage.attribs.href.split('=').at(1));

    const list = [];
    const dataList  =  $('.news-list')
    .find('.news-unit');
    for(const element of dataList){
        const tags = $(element).attr('data-tag').split(' ').filter(elm => elm);
        if(!(filters!= undefined &&! filters.split(',').map((e) => `cat${e}`).some(item => tags.includes(item)))) {
        const title  = $(element).find('.title').text().trim();
        if(title != ''){
         const imageUrlElement = $(element).find('.image-link');
            const newsUrl = imageUrlElement.attr('href');
            const imageSrc = imageUrlElement.find('.image').attr('srcset');
            const imageId = imageSrc.split(', ')[1].split(' ')[0].replace('').split('/').at(-1).split('?')[0];
     
            const image = `https://cdn.myanimelist.net/s/common/uploaded_files/${imageId}`;
            const excerpt  = $(element).find('.text').text().trim();
            
            const information  = $(element).find('.information');
            const date = information.find('.info').text().trim();
            const author = information.find('.info').children().first();
            const authorUsername= author.text().trim();
            const authorUrl = author.attr('href');
            const comment = information.find('.info').children().last();
            const comments= parseInt(comment.text().trim().split(' ')[0]);
            const forumUrl = comment.attr('href');
    
            const all = {
                mal_id: parseInt(newsUrl.split('/').at(-1)),
                url: newsUrl,
                title: title,
                date : date,
                author_username: authorUsername,
                author_url: authorUrl,
                forum_url: forumUrl,
                images:{'jpg':{'image_url':image}},
                excerpt: excerpt,
                comments: comments,
            };
            
            list.push(all);
        }
    }
}

return {
    last_visible_page: lastVisiblePage,
    data: list};
};

server.get('/news', async(req, res) =>{
    if(req.query.id == undefined) return;

    const axiosResponse = await axios.request({
        method: "GET",
        url: `https://myanimelist.net/news/${req.query.id}`,
        headers: {
            "User-Agent":getUserAgent(),
        }
    });

    const $ = cheerio.load(axiosResponse.data)

    const newsContainer  =  $('.news-container');
        const title  = $(newsContainer).find('.title').text().trim();

        if(title != ''){
      
        const information  = $(newsContainer).find('.information');

            const authorName= information.children().first().text().trim();
            const authorLink = information.children().first().attr('href');
            const comment = information.children().last();
            const commentUrl = comment.attr('href');
            const commentCount = parseInt(comment.text().split(' ')[0]);
     
            const dateTime = information.text().split(authorName)[1].split(' | ')[0];
            const content  = $(newsContainer).find('div.content');
            const tagsList = [];
            $(newsContainer).find('.tags').children().each(function (i, elem) {
                tagsList[i] = $(this).text();
              });

        const contentList = [];
 
        content.get().at(0).children.forEach(element => {
            if(element.type == 'text'){
                contentList.push({'text' : element.data});
            }
            else{
                switch(element.name){
                    case 'i' : contentList.push({'text' : element.firstChild.data}); break;
                    case 'a' :   contentList.push({'url' : {'text' : $(element).text() , 'url' : element.attribs['href']}}); break;
                    case 'img' : contentList.push({'image' : element.attribs['src']}) ; break;   
                    case 'iframe' :  contentList.push({'video' : element.attribs['src']}); break;   
                }
                
            }
            
                });
            const all = {
               authorName: authorName,
               authorLink: authorLink,
               commentCount: commentCount,
               dateTime: dateTime,
               commentUrl: commentUrl,
               content: contentList,
               tags: tagsList
            };

        res.send(all);

        }

});

server.get('/wallpaper' , async (req, res) => {
    const name = req.query.name;

    var results = await getImagesData(name);

    res.send(results);
});


// server.get('/articles', async (req ,res) => {
//     var url = "https://myanimelist.net/featured";
//     if(req.query.page != null){
//         url +='?p=' + req.query.page;
//     }
//     const axiosResponse = await axios.request({
//         method: "GET",
//         url:url,
//         headers: {
//             "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36"
//         }
//     });

//     const $ = cheerio.load(axiosResponse.data)

//     const list = [];
//     $('.content-left')
//     .find('.featured-pickup-unit')
//     .each((index , element) =>{

//         const imageLinkElement = $(element).find('.image');

//         const link= imageLinkElement.attr('href');
//         const image = imageLinkElement.attr('data-bg');
//         const title = $(element).find('.title').text().trim();
//         const description = $(element).find('.text').text().trim();

//         const information = $(element).find('.information');
//         const author = information.children().first().children().first();
//         const authorName = author.text();
//         const authorLink =  author.attr('href');

//         const views = information.children().next().children().first().text();

//         const tags = information.find('.tags');
//         const tag = tags.contents().text().trim();
        
//         const all = {
//             featured: true,
//             link:  link,
//             image: image.replace('/r/350x160' , ''),
//             title: title,
//             description: description,
//             authorName: authorName,
//             authorLink: authorLink,
//             views: parseInt(views.replace(',' , '')),
//             ...tag != '' && {tag: tag}
//         };

//         list.push(all);
//     });

//     $('.content-left')
//     .find('.news-unit')
//     .each((index , element) =>{

//         const imageLinkElement = $(element).find('.image-link');

//         const link= imageLinkElement.attr('href');
//         const image = imageLinkElement.find('.image').attr('data-src');
//         const title = $(element).find('.title').text().trim();
//         const description = $(element).find('.text').text().trim();

//         const information = $(element).find('.information');
//         const author = information.children().first().children().first();
//         const authorName = author.text();
//         const authorLink =  author.attr('href');

//         const views = information.children().next().children().first().text();

//         const tags = information.find('.tags');
//         const tag = tags.contents().text().trim();
        
//         const all = {
//             featured: false,
//             link:  link,
//             image: image,
//             title: title,
//             description: description,
//             authorName: authorName,
//             authorLink: authorLink,
//             views: parseInt(views.replace(',' , '')),
//             ...tag != '' && {tag: tag}
//         };

//         list.push(all);
//     });

//     res.send(list);
// });

server.get('/discussions/anime', async (req ,res) => {   
    try{
    const axiosResponse = await axios.request({
        method: "GET",
        url:`https://myanimelist.net/forum`,
        headers: {
           "User-Agent":getUserAgent(),
        },
        params: {
            topicid: req.query.id,
            show :  ((req.query.page??1) - 1) * 50,
        }
    });

    const $ = cheerio.load(axiosResponse.data)

    const title = $('.forum_locheader').text();
    const list = [];

    var lastVisiblePage = $('.pages').get().at(0).childNodes.at(0);
    if(lastVisiblePage == undefined) lastVisiblePage = 1;
    else lastVisiblePage = parseInt(lastVisiblePage.data.split('(').at(1).split(')').at(0));
    var topic;
    $('.forum-topic-message')
    .each((index , element) =>{

        if($(element).attr('data-id') == undefined ) return;
        const date = parseInt($(element).find('.date').attr('data-time')) *Math.pow(10, 3);

        const profile = $(element).find('.profile');

        const username = profile.find('.username').children().first();
        const authorUsername = username.text();
        const authorUrl = `https://myanimelist.net${username.attr('href')}`;

        const userIcon = profile.find('.forum-icon').children().first().attr('data-src');
        const userStatus = profile.find('.userstatus').text();
        const joined = profile.find('.userinfo').first().text();
        const posts = parseInt(profile.find('.userinfo').last().text());
        const contentList = [];
        const followContentList = [];
        const content  = $(element).find('div.content').find('.body').children().first().children().first().children().first();
        const followContent  = $(element).find('div.content').find('.sig').children().first().children().first().children().first();
        
        const getContent = (element)=>{
            if(element.type == 'text'){ 
                return {'text' : element.data};
            }
            else{
                switch(element.name){
                    case 'span' : return {'stylized' : {'content': element.children.map(element => getContent(element)).filter(a => a) , 'style': element.attribs['style']}};
                    case 'i' : return {'stylized' : {'content' : [getContent(element.firstChild)] , 'style': 'italic'}};
                    case 'u' : return {'stylized' : {'content' : [getContent(element.firstChild)] , 'style': 'underline'}};
                    case 'li' : return {'item' : element.children.map(element => getContent(element)).filter(a => a)};
                    case 'ul' : return {'group' : element.children.map(element =>  getContent(element)).filter(a => a)};
                    case 'div' :
                         if(element.attribs['class'] == 'quotetext')  return {'container' : element.children.map(element =>  getContent(element)).filter(a => a)};
                    else if(element.attribs['class'] == 'spoiler') return {'spoiler' : {'content': element.lastChild.children.map(element => getContent(element)).filter(a => a) , 'show': element.firstChild.attribs['value'] , 'hide': element.firstChild.attribs['data-hidename']}};
                   else if(element.attribs['style'] != undefined) return {'align':{ 'content': element.children.map(element =>  getContent(element)).filter(a => a) , 'align': element.attribs['style'].split(' ').at(1).split(';').at(0)}};
                    case 'a' :
                    const url =  element.attribs['href'];
                    if(url == undefined) return;
                    let content;
                    if(element.firstChild == null){
                        content = $(element).text();
                        if(content.length == 0) return;
                    }
                    else{
                        content = getContent(element.firstChild);
                        if(content == {}) return;
                    }
                    return {'url' : {'content' :content , 'url' : url}};
                    case 'img' : return {'image' : element.attribs['src']};  
                    case 'ol' :  return {'stylized' :{'content':  element.children.map(element =>  getContent(element)).filter(a => a) , 'style': 'quote'}};
                    case 'iframe' :  return {'video' : element.attribs['src'].split('/').at(-1).split('?').at(0)};
                    case 'b':  return {'stylized' : {'content' : [getContent(element.firstChild)] , 'style': 'bold'}};
                    case 'strong':  return {'highlighted' : $(element).text()};
                }
                
            }
        }
        content.get().at(0).children.forEach(element => {
            const content =  getContent(element);

            if(content != null){
                contentList.push( content);
        }
                });
                if(followContent.length!=0){
                followContent.get().at(0).children.forEach(element => {
                    const followContent =  getContent(element);
                    if(followContent != null)
                   followContentList.push( followContent);
                        });        
                    }
           
        const reply  = $(element).find('div.content').find('.replied-container');
        const target = reply.children().first().text();
        const replyBody = reply.children().first().next().text();
        


       

        const all ={
            date: date,
            userName: authorUsername,
            userUrl : authorUrl,
            userIcon : userIcon,
            userStatus : userStatus,
            userJoined : joined,
            postsCount: posts,
            content: contentList,
        };
        if(reply.length != 0) 
            all['reply'] = {
                target: target,
                replyBody: replyBody,
            };
            if(followContentList.length != 0) 
                all['followContent'] = followContentList;
            if(index == 0)
                topic = all;
            else
                list.push(all);
    });
    res.send({
        url: `https://myanimelist.net/forum/?topicid=${req.query.id}`,
        current_page :  parseInt(req.query.page??1),
        last_visible_page: lastVisiblePage,
        title: title,
        topic: topic,
        replies: list
    });
}catch(e){
    console.log(e);
    res.send(e);
}
});
 

  server.get('/auth' , async( req ,res ) =>{
    const randomToken = crypto.randomBytes(48).toString('hex');
    console.log(`https://myanimelist.net/v1/oauth2/authorize?response_type=code&client_id=6d3de00d4035adac2bbf511d6aab8ca0&code_challenge=${randomToken}`);
    const axiosResponse = await axios.request({
        method: "GET",
        url:`https://myanimelist.net/v1/oauth2/authorize?response_type=code&client_id=6d3de00d4035adac2bbf511d6aab8ca0&code_challenge=${randomToken}`,
    });

  });


  function getToken(){
    const randomToken = crypto.randomBytes(128).toString('base64');
    return crypto.createHash('sha256').update(randomToken).digest('base64');
  }


    const bannedList = [
        'UHD Wallpaper',
        'YouTube',
        'Dailymotion',
        'Facebook'
    ];
    const getImagesData = async (query) => {
        const selectRandom = () => {
        const userAgents = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.121 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.157 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.71 Safari/537.36",
        ];
        var randomNumber = Math.floor(Math.random() * userAgents.length);
        return userAgents[randomNumber];
        };
        let user_agent = selectRandom();
        let header = {
        "User-Agent": `${user_agent}`,
        };
        var u = await unirest
        .get(
            `https://www.google.com/search?q=${query}&oq=${query}&hl=en&tbm=isch&asearch=arc&async=_id:rg_s,_pms:s,_fmt:pc&sourceid=chrome&ie=UTF-8`
        )
        .headers(header);
        let $ = cheerio.load(u.body);
        let images_results = [];
        $("div.rg_bx").each(async(i, el) => {
        let json_string =   $(el).find(".rg_meta").text();
        let json = await JSON.parse(json_string);
        if(bannedList.includes(json.st)) return;
        images_results.push({
            'src' : json.ou,
            'width': json.ow,
            'height': json.oh
        });
        });
        return images_results;
    };
    

    const getMALImage = async (query) => {
        let header = {
            "User-Agent": `${getUserAgent()}`,
            };
            var u = await unirest
            .get(
                `https://www.google.com/search?q=${query}&oq=${query}&hl=en&tbm=isch&asearch=arc&async=_id:rg_s,_pms:s,_fmt:pc&sourceid=chrome&ie=UTF-8`
            )
            .headers(header);
            let $ = cheerio.load(u.body);
        $("div.rg_bx").each(async(i, el) => {
        let json_string =   $(el).find(".rg_meta").text();
        let json = await JSON.parse(json_string);
        // console.log(json);
        if(json.st == 'MyAnimeList'){
            return json.ou;
        }
        });
        return '';
    };


    const getUserAgent = () => {
            const userAgents = [
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36",
                "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.121 Safari/537.36",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.157 Safari/537.36",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Safari/537.36",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.71 Safari/537.36",
            ];
            var randomNumber = Math.floor(Math.random() * userAgents.length);
            return userAgents[randomNumber];         
    };


const getLastNews = async ()=>{
    const axiosResponse = await axios.request({
        method: "GET",
        url: 'https://myanimelist.net/news',
        headers: {
            "User-Agent": getUserAgent(),
        },
    });

    const $ = cheerio.load(axiosResponse.data)

    const list = [];
    const element  =  $('.news-list')
    .find('.news-unit').first();
        const title  = $(element).find('.title').text().trim();
        if(title != ''){
         const imageUrlElement = $(element).find('.image-link');
            const newsUrl = imageUrlElement.attr('href');
            const imageSrc = imageUrlElement.find('.image').attr('srcset');
            const imageId = imageSrc.split(', ')[1].split(' ')[0].replace('').split('/').at(-1).split('?')[0];
     
            const image = `https://cdn.myanimelist.net/s/common/uploaded_files/${imageId}`;
            const excerpt  = $(element).find('.text').text().trim();
            
            const information  = $(element).find('.information');
            const date = information.find('.info').text().trim();
            const author = information.find('.info').children().first();
            const authorUsername= author.text().trim();
            const authorUrl = author.attr('href');
            const comment = information.find('.info').children().last();
            const comments= parseInt(comment.text().trim().split(' ')[0]);
            const forumUrl = comment.attr('href');
    
            const all = {
                mal_id: parseInt(newsUrl.split('/').at(-1)),
                url: newsUrl,
                title: title,
                date : date,
                author_username: authorUsername,
                author_url: authorUrl,
                forum_url: forumUrl,
                images:{'jpg':{'image_url':image}},
                excerpt: excerpt,
                comments: comments,
            };
            return all;
}
};

const sendNotification = (news)=>{
    const message = {
        data: {
          news_id: news.id
        },
        notification: {
          title:news.title,
          body: news.body
        },
        android: {
          notification: {
            imageUrl: news.imageUrl,
            color: '#FFA245'
          }
        },        
        topic : "RecentNews"   
  }; 
    
    admin.messaging().send(message)
    .then((response) => {
      console.log('Successfully sent message:'+ response);
    })
    .catch((error) => {
        console.log('Error sending message:'+ error);
    });
}

const check = async (fireDate) =>{
    const newNews = await getLastNews();
    var data;
    var lastNews;
    try{
        data = await fs.readFile('lastNews.txt', { encoding: 'utf8' });
        lastNews =JSON.parse(data); 
    }catch(e){}
    console.log(lastNews);
    if(lastNews != undefined && lastNews.mal_id != newNews.mal_id){
        sendNotification({
            title : newNews.title,
            body: newNews.excerpt,
            imageUrl : newNews.images.jpg.image_url,
            id: newNews.forum_url.split('=').at(1)
        });
    }
    fs.writeFile('lastNews.txt', JSON.stringify(newNews));
  };

schedule.scheduleJob('0 */4 * * * *',check ); 

server.listen(3000 , () => console.log('Listening on Port 3000..'));
