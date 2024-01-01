hljs.highlightAll();
marked.setOptions({
    highlight: function (code, language) {
        const _language = hljs.getLanguage(language) ? language : "javascript";
        return hljs.highlight(code, { language: _language }).value;
    },
});
let mediaRecorder = null;
const startInputSound = () => {
    return new Promise((resolve) => {
        try {
            navigator.mediaDevices
                .getUserMedia({ audio: true })
                .then((stream) => {
                    resolve(stream);
                })
                .catch((error) => {
                    console.log(error);
                });
        } catch (error) {
            content.innerHTML = "你的设备没有麦克风，或者你拒绝了麦克风权限";
        }
    });
};
const start = async () => {
    if (!GPT_API_KEY) {
        content.innerHTML = "请设置Openai_api_key，否则无法使用语音转文字功能";
        return;
    }
    send.innerHTML = "聆听中...";
    let stream = await startInputSound();
    if (stream) {
        mediaRecorder = new MediaRecorder(stream);
        const audioChunks = [];

        mediaRecorder.addEventListener("dataavailable", (event) => {
            audioChunks.push(event.data);
        });

        mediaRecorder.addEventListener("stop", async () => {
            const audioBlob = new Blob(audioChunks);
            const file = new File([audioBlob], "audio.mp3", { type: "audio/mp3" });
            const text = await transcriptions(file);
            if (text) {
                inputText.value = text;
                send.click();
            }
        });
        mediaRecorder.start();
    }
};
const stop = () => {
    mediaRecorder && mediaRecorder.stop();
};
const PostGeminiGetToken = (data) => {
    const model = modelList[modelIndex];
    const content = ":countTokens";
    return new Promise((resolve) => {
        fetch(host + url + model + content + "?key=" + API_KEY, {
            method: "POST",
            body: JSON.stringify(data),
            headers: { "Content-Type": "application/json" },
        })
            .then((res) => res.json())
            .then((res) => resolve(res));
    });
};
const PostGemini = async (data) => {
    function handleStr(str) {
        let _str = str;
        const _n = new RegExp("\n", "g");
        const _t = new RegExp("\t", "g");
        const _r = new RegExp("\r", "g");
        _str = _str.replace(_n, "");
        _str = _str.replace(_t, "");
        _str = _str.replace(_r, "");
        return _str;
    }
    if (safetySettings && safetySettings.length) {
        data.safetySettings = safetySettings;
    }
    data.generationConfig = {
        temperature: Number(temperature),
    };
    const model = modelList[modelIndex];
    let content = ":generateContent";
    if (steam) content = ":streamGenerateContent";
    if (modelIndex == 0 && longChat) {
        const token = await PostGeminiGetToken({ contents: data.contents });
        if (token && token.totalTokens >= inputMaxToken) {
            data.contents.shift();
            data.contents.shift();
        }
    }
    return new Promise((resolve) => {
        fetch(host + url + model + content + "?key=" + API_KEY, {
            method: "POST",
            body: JSON.stringify(data),
            headers: { "Content-Type": "application/json" },
        })
            .then(async (res) => {
                const reader = res.body.getReader();
                let e = "";
                let json = null;
                let promptFeedback = null;
                function chunkHandler({ done, value }) {
                    if (done) {
                        if (steam) {
                            checkResOk(json, true);
                            resetSendBtn();
                            resolve();
                        } else {
                            resetSendBtn();
                            resolve();
                        }
                        console.log("请求完成");
                        return;
                    }
                    let i = new TextDecoder().decode(value);
                    i = handleStr(i);
                    if (i[0] == "[" || i[0] == ",") i = i.slice(1);
                    if (i[i.length - 1] == "]") i = i.slice(0, i.length - 1);
                    if (i == "]") i = "";
                    e += i;
                    try {
                        if (e != "") {
                            json = JSON.parse(e);
                            if (json.promptFeedback) promptFeedback = json.promptFeedback;
                            json.promptFeedback = promptFeedback;
                            checkResOk(json);
                        }
                        e = "";
                    } catch (error) {
                        console.log(error, e);
                    }
                    reader.read().then(chunkHandler);
                }
                reader.read().then(chunkHandler);
            })
            .catch((e) => {
                console.error(e);
                send.innerHTML = "发送";
                send.className = "";
            });
    });
};
async function handleGemini(data) {
    try {
        await PostGemini(data);
    } catch (error) {
        content.innerHTML = error || "请求错误，请稍后重试";
    }
}
async function fileToGenerativePart(file) {
    const base64EncodedDataPromise = new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(",")[1]);
        reader.readAsDataURL(file);
    });
    return {
        inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
    };
}
function showPrePic(files, isBase64) {
    function createImage(blobUrl) {
        const img = document.createElement("img");
        img.src = blobUrl;
        img.className = "preImageItem";
        img.onclick = () => {
            const newImage = document.createElement("img");
            newImage.src = blobUrl;
            newImage.style.width = "50vw";
            showImage.innerHTML = "";
            showImage.appendChild(newImage);
            showImage.style.display = "flex";
        };
        return img;
    }
    preImage.innerHTML = "";
    if (isBase64) {
        for (let i = 0; i < files.length; i++) {
            const item = files[i];
            const img = createImage(item);
            preImage.append(img);
        }
    } else {
        for (let i = 0; i < files.length; i++) {
            const item = files[i];
            const reader = new FileReader();
            reader.onload = function () {
                const blob = new Blob([reader.result], { type: item.type });
                const blobUrl = URL.createObjectURL(blob);
                const img = createImage(blobUrl);
                preImage.append(img);
            };
            reader.readAsArrayBuffer(item);
        }
    }
    const closeBtn = document.createElement("div");
    closeBtn.className = "closeBtn";
    closeBtn.onclick = (e) => {
        e.stopPropagation();
        preImage.className = "";
        preImage.innerHTML = "";
        choosePic.files = [];
    };
    preImage.append(closeBtn);
}
function resetSendBtn() {
    send.className = "";
    send.innerHTML = "发送";
    inputText.value = "";
}
let temp = "";
function checkResOk(res, done) {
    let resText = "";
    if (res.error) {
        resText = res.error.message;
        content.innerHTML = marked(resText);
        content.scrollTop = content.scrollHeight;
        return;
    }
    if (res.promptFeedback.blockReason) {
        if (modelIndex == 0 && longChat) {
            ChatList.push({ parts: [{ text: "" }], role: "model" });
        }
        content.innerHTML = "受到安全限制，无法回复";
        return;
    }
    if (res.candidates[0].finishReason != "STOP") {
        if (modelIndex == 0 && longChat) {
            ChatList.push({ parts: [{ text: "" }], role: "model" });
        }
        resText = "受到安全限制，无法回复:" + res.candidates[0].finishReason;
    }
    let tempText = res.candidates[0].content && res.candidates[0].content.parts && res.candidates[0].content.parts[0].text;
    if (steam && !done) {
        temp += tempText;
    }
    if (modelIndex == 0 && longChat && done) {
        ChatList.push({ parts: [{ text: steam ? temp : tempText }], role: "model" });
    } else {
        resText = steam ? temp : tempText;
    }
    if (!resText) {
        resText = ChatList[ChatList.length - 1].parts[0].text;
    }
    content.innerHTML = marked(resText);
    content.scrollTop = content.scrollHeight;
    if (done) temp = "";
}
function changeSafeSetting() {
    const thresholdSelectAll = document.querySelectorAll(".thresholdSelect");
    const chooseSafeInputAll = document.querySelectorAll(".chooseSafeInput");
    safetySettings = [];
    for (let i = 0; i < chooseSafeInputAll.length; i++) {
        const item = chooseSafeInputAll[i];
        if (item.checked) {
            safetySettings.push({
                category: item.getAttribute("key"),
                threshold: thresholdSelectAll[i].value,
            });
        }
    }
}
function Uint8ArrayToString(fileData) {
    const decoder = new TextDecoder("utf-8");
    const decodedString = decoder.decode(fileData);
    return decodedString;
}
function getCameraImage() {
    const video = document.querySelector("#camera");
    const canvas = document.querySelector("#cameraImage");
    const ctx = canvas.getContext("2d");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL();
}
async function transcriptions(file) {
    const formData = new FormData();
    formData.append("file", file, file.name);
    formData.append("model", "whisper-1");
    try {
        let res = await post1(openaihost + "/v1/audio/transcriptions", formData);
        if (res.error) {
            send.innerHTML = "发送";
            send.className = "";
            content.innerHTML = res.error.message;
        }
        return (res && res.text) || "";
    } catch (error) {
        send.innerHTML = "发送";
        send.className = "";
        console.error(error);
    }
}
function post1(url, data) {
    const authHeaders = { Authorization: "Bearer " + GPT_API_KEY };
    return new Promise((resolve, reject) => {
        fetch(url, {
            body: data,
            method: "POST",
            headers: authHeaders,
        })
            .then((response) => response.json())
            .then((res) => {
                resolve(res);
            })
            .catch((error) => reject(error));
    });
}
const url = "/v1beta/models/";
let host = localStorage.getItem("host") || "https://generativelanguage.googleapis.com";
let openaihost = localStorage.getItem("openaihost") || "https://api.openai.com";
let GPT_API_KEY = localStorage.getItem("GPT_API_KEY") || "";
let API_KEY = localStorage.getItem("API_KEY") || "";
const modelList = ["gemini-pro", "gemini-pro-vision"];
let modelIndex = localStorage.getItem("modelIndex") || 0;
let longChat = localStorage.getItem("longChat") == "true" || false;
let steam = localStorage.getItem("steam") == "true" || false;
let ChatList = [];
const inputMaxToken = 30000; // 30720/2048 12288/4096
const thresholdMap = {
    HARM_BLOCK_THRESHOLD_UNSPECIFIED: "未指定阈值，使用默认阈值进行屏蔽",
    BLOCK_LOW_AND_ABOVE: "在存在不安全内容的几率较低、中等或较高时屏蔽",
    BLOCK_MEDIUM_AND_ABOVE: "出现中等或高概率的不安全内容时屏蔽",
    BLOCK_ONLY_HIGH: "在存在高风险的不安全内容时屏蔽",
    BLOCK_NONE: "始终显示（无论是否存在不安全内容的概率）",
};
const categoryMap = {
    HARM_CATEGORY_UNSPECIFIED: "未指定类别。",
    HARM_CATEGORY_DEROGATORY: "针对身份和/或受保护特征发表的负面或有害评论。",
    HARM_CATEGORY_TOXICITY: "粗俗、不雅或亵渎性的内容。",
    HARM_CATEGORY_VIOLENCE: "描述针对个人或群体的暴力行为的场景，或对血腥内容的一般描述。",
    HARM_CATEGORY_SEXUAL: "包含对性行为或其他淫秽内容的引用。",
    HARM_CATEGORY_MEDICAL: "宣传未经证实的医疗建议。",
    HARM_CATEGORY_DANGEROUS: "宣扬、助长或鼓励有害行为的危险内容。",
    HARM_CATEGORY_HARASSMENT: "骚扰内容。",
    HARM_CATEGORY_HATE_SPEECH: "仇恨言论和内容。",
    HARM_CATEGORY_SEXUALLY_EXPLICIT: "露骨色情内容。",
    HARM_CATEGORY_DANGEROUS_CONTENT: "危险内容。",
};
let thresholdKey = "HARM_BLOCK_THRESHOLD_UNSPECIFIED";
let categoryKey = "HARM_CATEGORY_UNSPECIFIED";
let safetySettings = [];
let stopSequences = [];
// let maxOutputTokens = 2048;
let temperature = localStorage.getItem("temperature") || 0.9;

let safeSettingShowStatus = localStorage.getItem("safeSettingShowStatus") == "true" || false;
let cameraOpen = false;
let startSoundInput = false;
let inputTextFocus = false;

const choosePic = document.querySelector("#choosePic");
const inputText = document.querySelector("#inputText");
const preImage = document.querySelector("#preImage");
const send = document.querySelector("#send");
const chooseModel = document.querySelector("#chooseModel");
const longChatBody = document.querySelector(".longChatBody");
const steamBody = document.querySelector(".steamBody");
const longChatInput = document.querySelector("#longChat");
const steamInput = document.querySelector("#steam");
const picBody = document.querySelector(".picBody");
const apiKey = document.querySelector("#apiKey");
const openaiapiKey = document.querySelector("#openaiapiKey");
const content = document.querySelector("#content");
const hostDom = document.querySelector("#host");
const openaihostDom = document.querySelector("#openaihost");
const safeSetting = document.querySelector(".safeSetting");
const temperatureDom = document.querySelector("#temperature");
const safeSettingTitle = document.querySelector(".safeSettingTitle");
const safeSettingBody = document.querySelector(".safeSettingBody");
const settingModel = document.querySelector(".settingModel");
const modelBody = document.querySelector(".modelBody");
const modelCloseBtn = document.querySelector(".closeModel .btn");
const otherSetting = document.querySelector("#otherSetting");
const useCamera = document.querySelector("#useCamera");
const soundInput = document.querySelector("#soundInput");
const useCamerabody = document.querySelector(".useCamerabody");
const showImage = document.querySelector(".showImage");
if (safeSettingShowStatus) {
    safeSettingTitle.innerHTML = "安全范围设置-收起";
    safeSettingBody.style.display = "flex";
} else {
    safeSettingTitle.innerHTML = "安全范围设置-展开";
    safeSettingBody.style.display = "none";
}
temperatureDom.setAttribute("value", temperature);
if (API_KEY) apiKey.value = API_KEY;
if (GPT_API_KEY) openaiapiKey.value = GPT_API_KEY;
if (host) hostDom.value = host;
if (openaihost) openaihostDom.value = openaihost;
longChatInput.checked = longChat;
steamInput.checked = steam;
if (modelIndex == 0) {
    picBody.style.display = "none";
    useCamerabody.style.display = "none";
    longChatInput.disabled = false;
} else {
    picBody.style.display = "flex";
    useCamerabody.style.display = "flex";
    longChatInput.disabled = true;
}
choosePic.files = [];

modelList.forEach((item, index) => {
    const option = document.createElement("option");
    option.innerHTML = item;
    option.value = index;
    if (index == modelIndex) option.selected = true;
    chooseModel.appendChild(option);
});
let count = 0;
for (const key in categoryMap) {
    const chooseSafe = document.createElement("div");
    chooseSafe.className = "safeItem";
    const chooseSafeInput = document.createElement("input");
    chooseSafeInput.className = "chooseSafeInput";
    chooseSafeInput.type = "checkbox";
    chooseSafeInput.setAttribute("index", count);
    chooseSafeInput.setAttribute("key", key);
    chooseSafeInput.onchange = () => {
        const thresholdSelectList = document.querySelectorAll(".thresholdSelect");
        const index = ~~chooseSafeInput.getAttribute("index");
        if (chooseSafeInput.checked) {
            thresholdSelectList[index].style.display = "flex";
        } else {
            thresholdSelectList[index].style.display = "none";
        }
        changeSafeSetting();
    };
    const chooseSafeText = document.createElement("div");
    chooseSafeText.className = "chooseSafeText clickText";
    chooseSafeText.setAttribute("index", count);
    chooseSafeText.setAttribute("key", key);
    chooseSafeText.innerHTML = categoryMap[key];
    chooseSafeText.onclick = () => {
        chooseSafeInput.checked = !chooseSafeInput.checked;
        const thresholdSelectList = document.querySelectorAll(".thresholdSelect");
        const index = ~~chooseSafeText.getAttribute("index");
        if (chooseSafeInput.checked) {
            thresholdSelectList[index].style.display = "flex";
        } else {
            thresholdSelectList[index].style.display = "none";
        }
        changeSafeSetting();
    };
    const chooseSafeView = document.createElement("div");
    chooseSafeView.className = "chooseSafeView";
    chooseSafeView.appendChild(chooseSafeInput);
    chooseSafeView.appendChild(chooseSafeText);
    chooseSafe.appendChild(chooseSafeView);
    const thresholdSelect = document.createElement("select");
    thresholdSelect.className = "thresholdSelect";
    for (const key in thresholdMap) {
        const option = document.createElement("option");
        option.value = key;
        option.innerHTML = thresholdMap[key];
        thresholdSelect.appendChild(option);
    }
    thresholdSelect.onchange = () => {
        changeSafeSetting();
    };
    chooseSafe.appendChild(thresholdSelect);
    safeSetting.append(chooseSafe);
    count++;
}
modelBody.onclick = (e) => {
    e.stopPropagation();
};
settingModel.onclick = () => {
    settingModel.style.display = "none";
};
modelCloseBtn.onclick = () => {
    settingModel.style.display = "none";
};
otherSetting.onclick = () => {
    settingModel.style.display = "flex";
};
inputText.onfocus = () => {
    inputTextFocus = true;
};
inputText.onblur = () => {
    inputTextFocus = false;
};
showImage.onclick = () => {
    showImage.style.display = "none";
};
useCamera.onclick = async () => {
    const video = document.querySelector("#camera");
    if (!cameraOpen) {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
        });
        preImage.innerHTML = "";
        video.srcObject = stream;
        cameraOpen = true;
    } else {
        cameraOpen = false;
        video.srcObject = null;
    }
};
safeSettingTitle.onclick = () => {
    if (safeSettingTitle.innerHTML == "安全范围设置-展开") {
        safeSettingTitle.innerHTML = "安全范围设置-收起";
        safeSettingBody.style.display = "flex";
        localStorage.setItem("safeSettingShowStatus", true);
    } else {
        safeSettingTitle.innerHTML = "安全范围设置-展开";
        safeSettingBody.style.display = "none";
        localStorage.setItem("safeSettingShowStatus", false);
    }
};
temperatureDom.oninput = () => {
    temperature = Number(Number(temperatureDom.value).toFixed(1));
    temperatureDom.setAttribute("value", temperature);
    localStorage.setItem("temperature", temperature);
};
apiKey.oninput = () => {
    API_KEY = apiKey.value;
    localStorage.setItem("API_KEY", API_KEY);
};
hostDom.oninput = () => {
    host = hostDom.value;
    localStorage.setItem("host", host);
};
openaiapiKey.oninput = () => {
    GPT_API_KEY = openaiapiKey.value;
    localStorage.setItem("GPT_API_KEY", GPT_API_KEY);
};
openaihostDom.oninput = () => {
    openaihost = openaihostDom.value;
    localStorage.setItem("openaihost", openaihost);
};
steamBody.onclick = () => {
    steam = !steam;
    localStorage.setItem("steam", steam);
    steamInput.checked = steam;
};
longChatBody.onclick = () => {
    if (modelIndex != 0) return;
    longChat = !longChat;
    localStorage.setItem("longChat", longChat);
    longChatInput.checked = longChat;
    ChatList = [];
};
chooseModel.onchange = () => {
    ChatList = [];
    modelIndex = ~~chooseModel.value;
    localStorage.setItem("modelIndex", modelIndex);
    if (modelIndex == 0) {
        preImage.innerHTML = "";
        useCamerabody.style.display = "none";
        picBody.style.display = "none";
        longChatInput.disabled = false;
    } else {
        useCamerabody.style.display = "flex";
        picBody.style.display = "flex";
        longChatInput.disabled = true;
    }
};
choosePic.onclick = () => {
    cameraOpen = false;
    const video = document.querySelector("#camera");
    video.srcObject = null;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.click();
    input.onchange = () => {
        const files = input.files;
        let size = 0;
        if (files.length > 16) {
            content.innerHTML = "选择的图片超过16张，请重新选择";
            return;
        }
        for (let i = 0; i < files.length; i++) {
            const item = files[i];
            size += item.size;
        }
        if (size > 4190000) {
            content.innerHTML = "选择的图片超过4mb，请重新选择";
            return;
        }
        choosePic.files = files;
        showPrePic(choosePic.files);
        if (content.innerHTML == "选择的图片超过4mb，请重新选择") content.innerHTML = "";
    };
};
send.onclick = async () => {
    const text = inputText.value;
    const files = choosePic.files;
    if (!API_KEY) {
        content.innerHTML = "请设置Gemini_api_key";
        return;
    }
    if (!text) {
        if (innerWidth < 500) {
            content.innerHTML = "请输入问题(点击右侧开始语言，再次点击停止语音)";
        } else {
            content.innerHTML = "请输入问题(长按空格进行语音输入/Ctrl+Enter快速发送)";
        }
        return;
    }
    if (send.className == "loading") return;
    send.className = "loading";
    send.innerHTML = "";
    let data = [];
    if (modelIndex == 0) {
        if (longChat) ChatList.push({ parts: [{ text }], role: "user" });
        else ChatList = [{ parts: [{ text }], role: "user" }];
        data = { contents: ChatList };
    }
    if (modelIndex == 1) {
        const parts = [{ text }];
        if (cameraOpen) {
            const imageBaseData = getCameraImage();
            showPrePic([imageBaseData], true);
            parts.push({
                inlineData: {
                    data: imageBaseData.replace(/^data:image\/(png|jpg|jpeg);base64,/, ""),
                    mimeType: "image/png",
                },
            });
        } else if (files.length) {
            for (let i = 0; i < files.length; i++) {
                const item = files[i];
                parts.push(await fileToGenerativePart(item));
            }
        }
        ChatList = [{ parts, role: "user" }];
        data = { contents: ChatList };
    }
    handleGemini(data);
};
soundInput.onmousedown = () => {
    if (send.innerHTML != "聆听中...") {
        soundInput.innerHTML = "停止语音";
        start();
    } else {
        soundInput.innerHTML = "开始语音";
        stop();
    }
};
if (innerWidth < 500) {
    inputText.setAttribute("placeholder", "请输入问题(点击右侧开始语言，再次点击停止语音)");
} else {
    inputText.setAttribute("placeholder", "请输入问题(长按空格进行语音输入/Ctrl+Enter快速发送)");
}
window.onresize = () => {
    if (innerWidth < 500) {
        inputText.setAttribute("placeholder", "请输入问题(点击右侧开始语言，再次点击停止语音)");
    } else {
        inputText.setAttribute("placeholder", "请输入问题(长按空格进行语音输入/Ctrl+Enter快速发送)");
    }
};
window.onkeydown = (e) => {
    if (e.ctrlKey && e.keyCode == 13) {
        send.click();
    }
    if (e.keyCode == 32 && !inputTextFocus) {
        if (send.innerHTML != "聆听中...") start();
    }
};
window.onkeyup = (e) => {
    if (e.keyCode == 32 && !inputTextFocus) {
        stop();
    }
};
