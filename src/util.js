async function load_js(url) {
    
    let exists = document.querySelector(`script[src="${url}"]`);
    if (exists) return;

    console.log(`Loading script ${url}`);

    return new Promise((resolve, reject) => {
        let script_tag = document.createElement("script");
        script_tag.src = url;
        script_tag.type = 'text/javascript';
        script_tag.onload = () => {
            console.log(`Loaded script ${url}`);
            resolve();
        };
        document.body.appendChild(script_tag);
    })
    
}

async function get_markdown_content_as_html(name) {
    await load_js("markdown_content/" + name + ".js");
    const markdown_content = eval(name)
    await load_js("node_modules/marked/marked.min.js");
    const marked = window["marked"];
    return marked.parse(markdown_content);
}

// Given an element inside a markdown content, returns the parent Article tag
// It wont work if the markdown article is not inside an article tag, example:
// 
//     <article id="1" class="markdown-body"></article>
//     document.getElementById('1').innerHTML = await get_markdown_content_as_html("content");
// 
function find_parent_article(element) {
    let parent = element.parentElement;
    while (parent.tagName !== 'ARTICLE') {
        parent = parent.parentElement;
    }
    return parent;
}

// This function will look for a piece of markdown like this one:
// 
//     ```json
//     /*interpret*/
//     {
//         "whatever": "you want",
//         "just make sure": "its valid json format"
//     }
//     ```
// 
// It will find it, parse the json content in there and execute the input parameter
// function `config_handler`, giving you the article element and the content of the json.
// The markdown blocks themselves will be hidden!
function interpret_markdown_configurations(config_handler) {
    let pre_codes = document.querySelectorAll("pre code");
    for (let i = 0; i < pre_codes.length; i++) {
        let pre_code = pre_codes[i];
        
        try {
            if (pre_code.textContent.startsWith('/*interpret*/')) {
                pre_code.style.display = "none";
                let length_of_header = '/*interpret*/\n'.length;
                let config_text = pre_code.textContent.substring(length_of_header);
                let config = JSON.parse(config_text);
                let article_element = find_parent_article(pre_code);
                if (article_element) {
                    config_handler(article_element, config);
                }
            }
        }
        catch (exception) {
            console.log("There was an error interpreting the configurations of a markdown article");
        }
    }
}