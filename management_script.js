var verbose=-1;  
var jsonrpc_id=1; // incremented on each request  
var url = "/v1";  
  
// 将数字日志级别转换为中文（基于 include/n3n/logging.h 的定义）  
function verboseToChinese(level) {  
    const levels = {  
        0: '0️⃣ 错误-ERROR',  
        1: '1️⃣ 警告-WARNING',  
        2: '2️⃣ 正常-NORMAL',  
        3: '3️⃣ 信息-INFO',  
        4: '4️⃣ 调试-DEBUG'  
    };  
    return levels[level] || level;  
}  
  
// 表头中英文映射（基于 src/management.c 中的数据结构）  
function headerToChinese(header) {  
    const headers = {  
        'version': '版本',  
        'current': '当前状态',  
        'macaddr': 'MAC地址',  
        'sockaddr': '连接地址',  
        'uptime': '运行时间',  
        'mode': '模式',  
        'ip4addr': 'IP地址',  
        'desc': '描述',  
        'type': '类型',  
        'tx_pkt': '发送包',  
        'rx_pkt': '接收包',  
        'community': '社区名称',  
        'last_register_req': '最后注册请求',  
        'last_rx_p2p': '最后P2P接收',  
        'last_rx_super': '最后supernode接收',  
        'last_sweep': '最后清理',  
        'last_sn_fwd': '最后supernode转发',  
        'last_sn_reg': '最后supernode注册',  
        'start_time': '启动时间'  
    };  
    return headers[header] || header;  
}  
  
// 将特定值转换为中文  
function valueToChinese(key, value) {  
    const conversions = {  
        'mode': {  
            'pSp': 'supernode转发',  
            'p2p': 'P2P直连',  
            'sn': 'supernode注册'  
        },  
        'type': {  
            'transop': '转换操作',  
            'p2p': 'P2P直连',  
            'super': 'supernode',  
            'super_broadcast': 'supernode广播',  
            'tuntap_error': 'TUN/TAP错误',  
            'multicast_drop': '组播丢弃',  
            'sn_fwd': 'supernode转发',  
            'sn_broadcast': 'supernode广播',  
            'sn_reg': 'supernode注册',  
            'sn_errors': 'supernode错误'  
        },  
        'current': {  
            0: '0️⃣ 非当前',  
            1: '1️⃣ 当前',  
            2: '2️⃣ 等待中'  
        },  
        'community': {  
            '-/-': '-/-'  
        }  
    };  
  
    if (conversions[key] && conversions[key][value] !== undefined) {  
        return conversions[key][value];  
    }  
    return value;  
}  
  
// 格式化时间戳为年-月-日 时:分:秒  
function formatTimestamp() {  
    const now = new Date();  
    return now.getFullYear() + '-' +  
        String(now.getMonth() + 1).padStart(2, '0') + '-' +  
        String(now.getDate()).padStart(2, '0') + ' ' +  
        String(now.getHours()).padStart(2, '0') + ':' +  
        String(now.getMinutes()).padStart(2, '0') + ':' +  
        String(now.getSeconds()).padStart(2, '0');  
}  
  
// 格式化Unix时间戳为年-月-日 时:分:秒，当为0时返回"从未"  
function formatUnixTimestamp(timestamp) {  
    // 确保转换为数字进行比较  
    const numTimestamp = Number(timestamp);  
    if (numTimestamp === 0) {  
        return "从未";  
    }  
    const date = new Date(numTimestamp * 1000); // Unix时间戳是秒，需要转换为毫秒  
    return date.getFullYear() + '-' +  
        String(date.getMonth() + 1).padStart(2, '0') + '-' +  
        String(date.getDate()).padStart(2, '0') + ' ' +  
        String(date.getHours()).padStart(2, '0') + ':' +  
        String(date.getMinutes()).padStart(2, '0') + ':' +  
        String(date.getSeconds()).padStart(2, '0');  
}  
  
// 将秒数转换为可读的时间格式（用于运行时间）  
function formatUptime(seconds) {  
    // 确保转换为数字  
    const numSeconds = Number(seconds);  
    if (numSeconds === 0) {  
        return "0秒";  
    }  
      
    const days = Math.floor(numSeconds / 86400);  
    const hours = Math.floor((numSeconds % 86400) / 3600);  
    const minutes = Math.floor((numSeconds % 3600) / 60);  
    const secs = numSeconds % 60;  
      
    let result = [];  
    if (days > 0) result.push(days + '天');  
    if (hours > 0) result.push(hours + '小时');  
    if (minutes > 0) result.push(minutes + '分钟');  
    if (secs > 0 || result.length === 0) result.push(secs + '秒');  
      
    return result.join(' ');  
}  
  
function result2verbose(id, unused, data) {  
    verbose = data;  
    let div = document.getElementById(id);  
    div.innerHTML = verboseToChinese(verbose);  
}  
  
function rows2keyvalue(id, keys, data) {  
    let s = "<table class='modern-table'>"  
    data.forEach((row) => {  
        keys.forEach((key) => {  
            if (key in row) {  
                let value = valueToChinese(key, row[key]);  
                s += "<tr><th style='text-align: center;'>" + headerToChinese(key) +  
                    "<td style='text-align: center;'>" + value + "</td></tr>";  
            }  
        });  
    });  
    s += "</table>"  
    let div = document.getElementById(id);  
    div.innerHTML = s  
}  
  
function rows2keyvalueall(id, unused, data) {  
    let s = "<table class='modern-table'>"  
    Object.keys(data).forEach((key) => {  
        let value = data[key];  
        // 检查是否为时间戳字段并格式化  
        if (key.includes('time') || key.includes('last_') || key === 'start_time') {  
            value = formatUnixTimestamp(value);  
        }  
        let chineseValue = valueToChinese(key, value);  
        s += "<tr><th style='text-align: center;'>" + headerToChinese(key) +  
            "<td style='text-align: center;'>" + chineseValue + "</td></tr>";  
    });  
    s += "</table>"  
    let div = document.getElementById(id);  
    div.innerHTML = s  
}  
  
function rows2table(id, columns, data) {  
    let s = "<table class='modern-table'>"  
    s += "<thead><tr>"  
    columns.forEach((col) => {  
        s += "<th>" + headerToChinese(col) + "</th>"  
    });  
    s += "</tr></thead><tbody>"  
    data.forEach((row) => {  
        s += "<tr>"  
        columns.forEach((col) => {  
            val = row[col]  
            if (typeof val === "undefined") {  
                val = ''  
            } else {  
                // 特殊处理uptime字段，转换为可读时间格式  
                if (col === 'uptime') {  
                    val = formatUptime(val);  
                } else {  
                    val = valueToChinese(col, val)  
                }  
            }  
            s += "<td>" + val + "</td>"  
        });  
        s += "</tr>"  
    });  
    s += "</tbody></table>"  
    let div = document.getElementById(id);  
    div.innerHTML = s  
}  
  
function do_jsonrpc(url, method, params, id, handler, handler_param) {  
    let body = {  
        "jsonrpc": "2.0",  
        "method": method,  
        "id": jsonrpc_id,  
        "params": params  
    }  
    jsonrpc_id++;  
  
    fetch(url, {method:'POST', body: JSON.stringify(body)})  
    .then(function (response) {  
        if (!response.ok) {  
            throw new Error('Fetch got ' + response.status)  
        }  
        return response.json();  
    })  
    .then(function (data) {  
        if ('error' in data) {  
            throw new Error('JsonRPC got ' + data['error'])  
        }  
        handler(id,handler_param,data['result']);  
    })  
    .catch(function (err) {  
        console.log(err);  
    });  
}  
  
function do_stop() {  
    // FIXME: uses global in script library  
    do_jsonrpc(  
        url, "stop", null,  
        'verbose',  
        function (id,param,result) {}, null  
    );  
}  
  
function setverbose(tracelevel) {  
    if (tracelevel < 0) {  
        tracelevel = 0;  
    }  
    // FIXME: uses global in script library  
    do_jsonrpc(  
        url, "set_verbose",  
        [tracelevel],  
        'verbose',  
        result2verbose, null  
    );  
}  
  
function refresh_job() {  
    do_jsonrpc(  
        url, "get_verbose",  
        null,  
        'verbose',  
        result2verbose, null  
    );  
    do_jsonrpc(  
        url, "get_communities",  
        null,  
        'communities',  
        rows2keyvalue,  
        ['community']  
    );  
    do_jsonrpc(  
        url, "get_supernodes",  
        null,  
        'supernodes',  
        rows2table,  
        ['version', 'current', 'macaddr', 'sockaddr', 'uptime']  
    );  
    do_jsonrpc(  
        url, "get_edges",  
        null,  
        'edges',  
        rows2table,  
        ['mode', 'ip4addr', 'macaddr', 'sockaddr', 'desc']  
    );  
    do_jsonrpc(  
        url, "get_timestamps",  
        null,  
        'timestamps',  
        rows2keyvalueall, null  
    );  
    do_jsonrpc(  
        url, "get_packetstats",  
        null,  
        'packetstats',  
        rows2table,  
        ['type', 'tx_pkt', 'rx_pkt']  
    );  
    // 更新时间戳显示  
    const timeDiv = document.getElementById('time');  
    timeDiv.innerHTML = formatTimestamp();  
}  
  
function refresh_setup(interval) {  
    var timer = setInterval(refresh_job, interval);  
}
