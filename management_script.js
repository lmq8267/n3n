var verbose = -1;
var jsonrpc_id = 1; // incremented on each request  
var url = "/v1";

// 全局变量跟踪加载状态  
let isLoading = false;

// 设置按钮状态  
function setButtonLoading(buttonId, loading) {
    const button = document.getElementById(buttonId);
    if (!button) return;

    if (loading) {
        isLoading = true;
        button.disabled = true;
        button.classList.add('btn-loading');
        button.dataset.originalText = button.innerHTML;
        // 添加加载文字  
        button.innerHTML = '<span>🔄</span> 加载中...';
    } else {
        isLoading = false;
        button.disabled = false;
        button.classList.remove('btn-loading');
        // 恢复原始文本  
        if (button.dataset.originalText) {
            button.innerHTML = button.dataset.originalText;
        }
    }
}

// 显示加载状态  
function showLoadingStatus(elementId, message, isPagination = false) {
    const element = document.getElementById(elementId);
    if (!element) return;

    const cssClass = isPagination ? 'loading-pagination' : 'loading-text';
    element.innerHTML = `<div class="loading"><span class="${cssClass}">${message}</span></div>`;
}

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
        'ip4addr': '虚拟IP',
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
            0: '0️⃣ 不活跃',
            1: '1️⃣ 已连接',
            2: '2️⃣ 连接中'
        },
        'community': {
            '-/-': '联邦社区'
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

// 检测响应是否溢出    
function checkOverflow(response) {
    if (response && response.error && response.error.code === 507) {
        return response.error.data ? response.error.data.count : null;
    }
    return null;
}

// 单次JSON-RPC请求（不处理分页）    
function do_jsonrpc_single(url, method, params, id, handler, handler_param) {
    return new Promise((resolve, reject) => {
        let retryCount = 0;
        const maxRetries = 3;

        function attemptRequest() {
            let body = {
                "jsonrpc": "2.0",
                "method": method,
                "id": jsonrpc_id,
                "params": params
            }
            jsonrpc_id++;

            fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            }).then(response => {
                if (response.status === 401) {
                    return response.text().then(text => {
                        throw new Error(`未认证401 - 原始响应: ${text}`);
                    });
                }
                if (response.status === 507) {
                    return response.text().then(text => {
                        try {
                            return { status: 507, data: JSON.parse(text) };
                        } catch (e) {
                            return { status: 507, data: { error: { code: 507, message: "overflow", raw: text } } };
                        }
                    });
                }
                if (!response.ok) {
                    return response.text().then(text => {
                        throw new Error(`HTTP ${response.status} - 原始响应: ${text}`);
                    });
                }
                return response.text().then(text => {
                    if (!text.trim()) throw new Error('返回体为空');
                    try {
                        return { status: 200, data: JSON.parse(text) };
                    }
                    catch (parseError) {
                        throw new Error(`JSON解析错误：${parseError.message} - 原始响应: ${text}`);
                    }
                });
            }).then(result => {
                if (result.status === 507) {
                    handler(id, handler_param, result.data);
                    resolve(result.data);
                }
                else {
                    const data = result.data;
                    if (!data || typeof data !== 'object') throw new Error('JSON-RPC响应无效');
                    if ('error' in data) {
                        const error = data.error;
                        throw new Error(`JSON-RPC错误 ${error.code}: ${error.message}`);
                    }
                    if (!('result' in data)) throw new Error('响应缺少result字段');
                    handler(id, handler_param, data.result);
                    resolve(data.result);
                }
            }).catch(err => {
                // 检查是否为网络错误，如果是则重试  
                if (isNetworkError(err) && retryCount < maxRetries) {
                    retryCount++;
                    console.warn(`网络错误，正在进行第 ${retryCount} 次重试: ${err.message}`);
                    setTimeout(attemptRequest, 1000 * retryCount); // 递增延迟  
                    return;
                }
                // 非网络错误或已达到最大重试次数  
                handler(id, handler_param, null, err);
                reject(err);
            });
        }

        attemptRequest();
    });
}

// 带自动分页的JSON-RPC请求 - 增加重试机制  
function do_jsonrpc_with_pagination(url, method, params, id, handler, handler_param) {
    return new Promise((resolve, reject) => {
        let overallRetryCount = 0;
        const maxOverallRetries = 3;

        function attemptPagination() {
            do_jsonrpc_single(url, method, params, id, function (responseId, pageParam, result, error) {
                if (error) {
                    // 检查是否为网络错误，如果是则重试整个分页流程  
                    if (isNetworkError(error) && overallRetryCount < maxOverallRetries) {
                        overallRetryCount++;
                        console.warn(`分页请求网络错误，正在进行第 ${overallRetryCount} 次重试: ${error.message}`);
                        setTimeout(attemptPagination, 1000 * overallRetryCount);
                        return;
                    }
                    return reject(error); // 直接传递详细错误  
                }

                let overflowCount = checkOverflow(result);
                if (overflowCount === null) {
                    handler(responseId, handler_param, result);
                    return resolve(result);
                }

                showLoadingStatus(id, '数据过多，正在分页获取...', true);
                let limit = Math.max(1, overflowCount - 1);
                let offset = 0;
                let allResults = [];
                let maxRetries = 3, retryCount = 0, pageCount = 0;

                function fetchPaginated() {
                    pageCount++;
                    showLoadingStatus(id, `正在获取第 ${pageCount} 页数据...`, true);
                    let paginatedParams = Object.assign({}, params || {}, { limit, offset });

                    do_jsonrpc_single(url, method, paginatedParams, responseId, function (pageId, pageParam, partialResult, pageError) {
                        if (pageError) {
                            // 检查是否为网络错误，如果是则重试当前页  
                            if (isNetworkError(pageError) && retryCount < maxRetries) {
                                retryCount++;
                                console.warn(`第${pageCount}页网络错误，正在进行第 ${retryCount} 次重试: ${pageError.message}`);
                                setTimeout(fetchPaginated, 500 * retryCount);
                                return;
                            }
                            return reject(new Error(`分页请求失败，第${pageCount}页: ${pageError.message}`));
                        }

                        if (partialResult === null) return reject(new Error(`分页请求失败，第${pageCount}页`));

                        const newOverflowCount = checkOverflow(partialResult);
                        if (newOverflowCount !== null) {
                            if (newOverflowCount === overflowCount) return reject(new Error(`分页参数调整无效，第${pageCount}页`));
                            overflowCount = newOverflowCount;
                            limit = Math.max(1, overflowCount - 1);
                            retryCount++;
                            if (retryCount >= maxRetries) return reject(new Error('超过最大重试次数'));
                            setTimeout(fetchPaginated, 200);
                            return;
                        }

                        if (!Array.isArray(partialResult)) return reject(new Error(`返回数据格式错误，第${pageCount}页`));

                        allResults = allResults.concat(partialResult);
                        offset = allResults.length;
                        retryCount = 0;

                        if (partialResult.length < limit) {
                            handler(responseId, handler_param, allResults);
                            return resolve(allResults);
                        }

                        setTimeout(fetchPaginated, 50);
                    }).catch(err => reject(err));
                }

                fetchPaginated();
            }, handler_param).catch(err => {
                // 检查是否为网络错误，如果是则重试整个分页流程  
                if (isNetworkError(err) && overallRetryCount < maxOverallRetries) {
                    overallRetryCount++;
                    console.warn(`分页初始化网络错误，正在进行第 ${overallRetryCount} 次重试: ${err.message}`);
                    setTimeout(attemptPagination, 1000 * overallRetryCount);
                    return;
                }
                reject(err);
            });
        }

        attemptPagination();
    });
}

// 辅助函数：判断是否为网络错误  
function isNetworkError(error) {
    // 检查常见的网络错误特征  
    return (
        error instanceof TypeError &&
        (error.message.includes('fetch') ||
            error.message.includes('network') ||
            error.message.includes('Failed to fetch') ||
            error.message.includes('NetworkError') ||
            error.message.includes('ECONNREFUSED') ||
            error.message.includes('ETIMEDOUT') ||
            error.message.includes('ENOTFOUND'))
    ) || (
            error.name === 'NetworkError' ||
            error.name === 'TypeError'
        );
}

function result2verbose(id, unused, data, error) {
    if (error) {
        let div = document.getElementById(id);
        div.innerHTML = `<div class="error">加载失败：${error.message}</div>`;
        return;
    }
    verbose = data;
    let div = document.getElementById(id);
    div.innerHTML = verboseToChinese(verbose);
}

function rows2keyvalue(id, keys, data, error) {
    let div = document.getElementById(id);
    if (!div) return;

    if (error) {
        div.innerHTML = `<div class="error">加载失败：${error.message}</div>`;
        return;
    }

    if (!data) {
        div.innerHTML = '<div class="error">数据加载失败</div>';
        return;
    }

    if (!Array.isArray(data)) {
        div.innerHTML = '<div class="error">数据格式错误</div>';
        return;
    }
    let s = "<div class='table-container'><table class='modern-table'>"
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

    div.innerHTML = s
}

function rows2keyvalueall(id, unused, data) {
    let s = "<div class='table-container'><table class='modern-table'>"
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
    let div = document.getElementById(id);
    if (!div) return;

    // 参考n3nctl的严格数据验证  
    if (!data) {
        div.innerHTML = '<div class="error">数据加载失败</div>';
        return;
    }

    if (!Array.isArray(data)) {
        div.innerHTML = '<div class="error">数据格式错误</div>';
        return;
    }

    if (data.length === 0) {
        div.innerHTML = '<div class="info">暂无数据</div>';
        return;
    }
    let s = "<div class='table-container'><table class='modern-table'>"
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

    div.innerHTML = s
}

// 支持自动分页    
function do_jsonrpc(url, method, params, id, handler, handler_param) {
    const paginatedMethods = ['get_edges', 'get_supernodes', 'get_packetstats', 'get_mac', 'get_communities'];
    if (paginatedMethods.includes(method)) return do_jsonrpc_with_pagination(url, method, params, id, handler, handler_param);
    return do_jsonrpc_single(url, method, params, id, handler, handler_param);
}

// 全局变量存储待执行的操作  
let pendingOperation = null;

// 显示密码输入模态框  
function showPasswordModal(title, message, operation) {
    pendingOperation = operation;
    document.getElementById('passwordModalTitle').textContent = title;
    document.getElementById('passwordModalMessage').textContent = message;
    document.getElementById('passwordInput').value = '';
    document.getElementById('passwordError').style.display = 'none';
    document.getElementById('passwordModal').style.display = 'block';

    // 聚焦密码输入框  
    setTimeout(() => {
        document.getElementById('passwordInput').focus();
    }, 100);
}

function showSuccessMessage(message) {
    const successDiv = document.createElement('div');
    successDiv.style.cssText = `  
        position: fixed;  
        top: 50%;  
        left: 50%;  
        transform: translate(-50%, -50%);  
        background: #4CAF50;  
        color: white;  
        padding: 20px;  
        border-radius: 5px;  
        z-index: 9999;  
    `;
    successDiv.textContent = message;
    document.body.appendChild(successDiv);
}

function showError(message) {
    const errorDiv = document.getElementById('passwordError');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }
}

function updateVerboseButtons() {
    const increaseBtn = document.querySelector('button[onclick*="verbose+1"]');
    const decreaseBtn = document.querySelector('button[onclick*="verbose-1"]');

    if (increaseBtn) increaseBtn.disabled = verbose >= 4;
    if (decreaseBtn) decreaseBtn.disabled = verbose <= 0;
}

// 关闭密码模态框  
function closePasswordModal() {
    document.getElementById('passwordModal').style.display = 'none';
    pendingOperation = null;

    // 重置按钮状态  
    const confirmBtn = document.getElementById('passwordConfirmBtn');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '确认';
    }

    // 清空密码输入和错误信息  
    const passwordInput = document.getElementById('passwordInput');
    if (passwordInput) {
        passwordInput.value = '';
    }
    const passwordError = document.getElementById('passwordError');
    if (passwordError) {
        passwordError.style.display = 'none';
    }
}

function restoreButtonState(button, originalText) {
    if (button) {
        button.disabled = false;
        button.innerHTML = originalText;
    }
}

// 执行带密码认证的操作  
function executeWithPassword(password) {
    if (!pendingOperation) return;

    const { type, params } = pendingOperation;
    const confirmBtn = document.getElementById('passwordConfirmBtn');
    const originalText = confirmBtn.innerHTML;

    // 禁用按钮并显示加载状态  
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<span>🔄</span> 处理中...';

    if (type === 'stop') {
        do_stop_with_auth(password, () => {
            closePasswordModal();
            showSuccessMessage('服务已停止，页面即将刷新...');
            setTimeout(() => window.location.reload(), 2000);
        }, (error) => {
            // 添加错误回调  
            restoreButtonState(confirmBtn, originalText);
            showError(error.message);
        });
    } else if (type === 'set_verbose') {
        setverbose_with_auth(params.level, password, () => {
            closePasswordModal();
            const div = document.getElementById('verbose');
            if (div) {
                div.innerHTML = verboseToChinese(verbose);
            }
            updateVerboseButtons();
        }, (error) => {
            // 添加错误回调  
            restoreButtonState(confirmBtn, originalText);
            showError(error.message);
        });
    }
}

// 带认证的停止函数  
function do_stop_with_auth(password, onSuccess, onError) {
    do_jsonrpc_with_auth(
        url, "stop", null,
        'verbose',
        function (id, param, result) {
            console.log('服务已停止');
            if (onSuccess) onSuccess();
        },
        null,
        password,
        onError // 添加错误回调  
    );
}

// 带认证的设置日志级别函数  
function setverbose_with_auth(tracelevel, password, onSuccess, onError) {
    // 添加范围检查 (0-4)  
    const MAX_VERBOSE = 4;
    const MIN_VERBOSE = 0;

    if (tracelevel > MAX_VERBOSE) {
        tracelevel = MAX_VERBOSE;
    }
    if (tracelevel < MIN_VERBOSE) {
        tracelevel = MIN_VERBOSE;
    }

    do_jsonrpc_with_auth(
        url, "set_verbose", [tracelevel],
        'verbose',
        function (id, param, result) {
            verbose = tracelevel;
            if (onSuccess) onSuccess();
        },
        null,
        password,
        onError // 添加错误回调  
    );
}

// 带认证的JSON-RPC请求  
function do_jsonrpc_with_auth(url, method, params, id, handler, handler_param, password, onError) {
    let body = {
        "jsonrpc": "2.0",
        "method": method,
        "id": jsonrpc_id,
        "params": params
    }
    jsonrpc_id++;

    const headers = {
        'Content-Type': 'application/json'
    };

    // 添加HTTP Basic认证  
    if (password) {
        const credentials = btoa(`unused:${password}`);
        headers['Authorization'] = `Basic ${credentials}`;
    }

    fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
    }).then(response => {
        if (response.status === 401) {
            throw new Error('密码错误');
        }
        if (!response.ok) {
            throw new Error('请求失败: ' + response.status);
        }
        return response.json();
    }).then(data => {
        if ('error' in data) {
            throw new Error('操作失败: ' + data.error.message);
        }
        handler(id, handler_param, data.result);
    }).catch(error => {
        console.error('请求失败:', error);

        // 调用错误回调而不是直接恢复按钮  
        if (onError) {
            onError(error);
        }

        if (error.message.includes('密码错误')) {
            document.getElementById('passwordError').textContent = '密码错误，请重试';
            document.getElementById('passwordError').style.display = 'block';
            // 清空密码框并聚焦  
            const passwordInput = document.getElementById('passwordInput');
            passwordInput.value = '';
            passwordInput.focus();
        } else {
            document.getElementById('passwordError').textContent = error.message;
            document.getElementById('passwordError').style.display = 'block';
        }
    });
}

// 修改按钮点击事件  
function showStopConfirm() {
    showPasswordModal(
        '停止服务确认',
        '请输入管理密码以停止n3n服务：',
        { type: 'stop' }
    );
}

function setverbose(tracelevel) {
    showPasswordModal(
        '设置日志级别',
        `请输入管理密码以设置日志级别为${tracelevel}：`,
        { type: 'set_verbose', params: { level: tracelevel } }
    );
}

// 密码输入框验证和确认按钮事件  
document.addEventListener('DOMContentLoaded', function () {
    const passwordInput = document.getElementById('passwordInput');
    const passwordConfirmBtn = document.getElementById('passwordConfirmBtn');

    if (passwordInput && passwordConfirmBtn) {
        // 密码输入框变化时验证  
        passwordInput.addEventListener('input', function () {
            const password = passwordInput.value.trim();
            passwordConfirmBtn.disabled = !password;
        });

        // 回车键确认  
        passwordInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                const password = passwordInput.value.trim();
                if (password) {
                    executeWithPassword(password);
                }
            }
        });

        // 确认按钮点击事件  
        passwordConfirmBtn.addEventListener('click', function () {
            const password = passwordInput.value.trim();
            if (password) {
                executeWithPassword(password);
            }
        });

        // 初始状态：禁用确认按钮  
        passwordConfirmBtn.disabled = true;
    }
});

function formatRelativeTime(timestamp) {
    const now = Math.floor(Date.now() / 1000); // 当前时间戳（秒）  
    const diff = now - timestamp; // 时间差（秒）  

    if (diff <= 0) return '刚刚';

    const d = Math.floor(diff / 86400); // 天  
    const h = Math.floor((diff % 86400) / 3600); // 小时  
    const m = Math.floor((diff % 3600) / 60); // 分钟  
    const s = diff % 60; // 秒  

    if (d > 0) {
        return `${d}天${h}小时${m}分钟${s}秒前`;
    } else if (h > 0) {
        return `${h}小时${m}分钟${s}秒前`;
    } else if (m > 0) {
        return `${m}分钟${s}秒前`;
    } else {
        return `${s}秒前`;
    }
}

let refreshStartTime = null;

// 实时更新时间显示（每秒更新）  
function startRealTimeClock() {
    setInterval(() => {
        const timeDiv = document.getElementById('time');
        if (timeDiv && refreshStartTime) {
            timeDiv.innerHTML = formatRelativeTime(refreshStartTime);
        }
    }, 1000); // 每秒更新  
}

async function refresh_job() {
    if (isLoading) {
        console.log('正在加载中，忽略重复请求');
        return;
    }

    isLoading = true;

    // 按钮进入加载状态
    setButtonLoading('refreshButton', true);
    // 显示各区域加载状态
    showLoadingStatus('communities', '等待中...');
    showLoadingStatus('edges', '等待中...');
    showLoadingStatus('supernodes', '等待中...');
    showLoadingStatus('timestamps', '等待中...');
    showLoadingStatus('packetstats', '等待中...');

    const requests = [
        {
            id: 'verbose',
            loadingText: '开始获取日志等级信息...',
            fn: () => do_jsonrpc(url, "get_verbose", null, 'verbose', result2verbose, null)
        },
        {
            id: 'communities',
            loadingText: '开始获取社区信息...',
            fn: () => do_jsonrpc(url, "get_communities", null, 'communities', rows2keyvalue, ['community'])
        },
        {
            id: 'supernodes',
            loadingText: '开始获取Supernodes信息...',
            fn: () => do_jsonrpc(url, "get_supernodes", null, 'supernodes', rows2table, ['version', 'current', 'macaddr', 'sockaddr', 'uptime'])
        },
        {
            id: 'edges',
            loadingText: '开始获取Edges信息...',
            fn: () => do_jsonrpc(url, "get_edges", null, 'edges', rows2table, ['mode', 'ip4addr', 'macaddr', 'sockaddr', 'desc'])
        },
        {
            id: 'timestamps',
            loadingText: '开始获取时间戳信息...',
            fn: () => do_jsonrpc(url, "get_timestamps", null, 'timestamps', rows2keyvalueall, null)
        },
        {
            id: 'packetstats',
            loadingText: '开始获取数据包统计...',
            fn: () => do_jsonrpc(url, "get_packetstats", null, 'packetstats', rows2table, ['type', 'tx_pkt', 'rx_pkt'])
        }
    ];

    for (const req of requests) {
        const element = document.getElementById(req.id);

        try {
            // 显示加载状态
            showLoadingStatus(req.id, req.loadingText);
            await new Promise(resolve => setTimeout(resolve, 50));

            // 串行请求
            await req.fn();

        } catch (error) {
            console.error(`请求 ${req.id} 失败:`, error);

            // 显示具体错误信息
            let detailedMsg = '';
            if (error instanceof Error) {
                detailedMsg = error.message;
            } else if (typeof error === 'object') {
                detailedMsg = JSON.stringify(error);
            } else {
                detailedMsg = String(error);
            }

            if (element) {
                element.innerHTML = `<div class="error">加载失败：${detailedMsg}</div>`;
            }
        }

        await new Promise(resolve => setTimeout(resolve, 80));
    }

    // 设置新的刷新时间点（重新计时）  
    refreshStartTime = Math.floor(Date.now() / 1000);

    try {
        // 立即更新时间显示为"刚刚"  
        const timeDiv = document.getElementById('time');
        if (timeDiv) {
            timeDiv.innerHTML = '刚刚';
        }
    } catch (error) {
        console.error('更新时间失败:', error);
    } finally {
        // 全部完成恢复按钮  
        setButtonLoading('refreshButton', false);
        isLoading = false;
    }
}

function refresh_setup(interval) {
    var timer = setInterval(refresh_job, interval);
}
