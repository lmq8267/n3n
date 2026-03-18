# [N3N](https://github.com/n42n/n3n)多平台架构的静态二进制程序

采用GitHub的云编译流程，编译的静态二进制程序，方便移植到不同的设备里运行，各种功能模块可选编译。

> ⚠️ 注意：构建矩阵里的`arm64`系列的`BSD` 耗时最长，如不需要可注释掉。（`OpenBSD-arm64编译全功能模块耗时接近2小时35分`）

[在线配置文件生成](https://lmq8267.github.io/n3n) 

---- 

### 帮助信息：

#### n3n-supernode 

```
./n3n-supernode -h

n3n —— 一个点对点 VPN，用于在没有局域网（LAN）的情况下使用

用法：supernode [选项...] [命令] [命令参数]

例如：supernode start [会话名称]

  根据会话名称加载配置（默认是 'supernode.conf'）
  命令行中的任何选项都会覆盖已加载的配置

更多帮助命令：

  supernode help commands   查看所有命令帮助
  supernode help options    查看所有选项帮助
  supernode help            查看总体帮助
```

```
./n3n-supernode help commands

debug      -> 调试相关命令

config     -> 配置相关命令
  addr       显示内部配置中的地址和大小
  dump       [级别] - 输出默认配置内容
  load_dump  [会话名称] - 从所有常规来源加载配置，然后输出

help       -> 帮助相关命令
  about      基本命令帮助
  commands   显示所有可用的命令行命令
  config     配置文件帮助
  options    说明所有命令行选项
  version    显示版本信息

start      [会话名称] - 启动会话
```

```
./n3n-supernode help options

选项        等效的配置项

-O <section>.<option>=<value>   设置任意配置项
-V                             显示版本信息
-d                             daemon.background=true（后台运行）
-v                             增加日志输出详细程度

短选项   对应的长选项
-d        --daemon
-h        --help
-v        --verbose
-V        --version
```

#### n3n-supernode 

```
./n3n-edge -h

n3n —— 一个点对点 VPN，用于在没有局域网（LAN）的情况下使用

用法：edge [选项...] [命令] [命令参数]

例如：edge start [会话名称]

  根据会话名称加载配置（默认是 'edge.conf'）
  命令行中的任何选项都会覆盖已加载的配置

更多帮助命令：

  edge help commands   查看所有命令帮助
  edge help options    查看所有选项帮助
  edge help            查看总体帮助
```

```
./n3n-edge help commands

所有可用子命令列表
需要多个单词才能完成的子命令会用 “->” 表示

例如：edge help about

debug      -> （调试命令，不保证易用性）
  config     ->
    addr       显示内部配置中的地址和大小
    dump       [级别] - 输出默认配置内容
    load_dump  [会话名称] - 从所有常规来源加载配置，然后输出
  random     ->
    seed       显示已编译的随机数种子生成器

help       -> 帮助相关命令
  about      基本命令帮助
  commands   显示所有可用的命令行命令
  config     显示所有配置文件帮助文本
  options    说明所有命令行选项
  transform  显示已编译的加密和压缩模块
  version    显示版本信息

start      [会话名称] - 启动会话

tools      -> 工具相关命令
  keygen     生成公钥

test       -> 测试相关命令
  benchmark  [pretty|raw] - 运行内部性能测试
  builtin    [级别] - 运行内置测试
  config     ->
    roundtrip  <会话名称> - 仅加载配置文件，然后再输出
  hashing    已弃用
  fakebench  [名称] - 统计测试指令（当 perf 不可用时）
```

```
./n3n-edge help options

选项        等效的配置项

-O <section>.<option>=<value>   设置任意配置项
-V                             显示版本信息
-a <参数>                      设置 tuntap.address 和 tuntap.address_mode
-c <参数>                      community.name=<参数>
-d                             daemon.background=true（后台运行）
-k <参数>                      community.key=<参数>
-l <参数>                      community.supernode=<参数>
-r                             filter.allow_routing=true（允许路由转发）
-v                             增加日志输出详细程度

短选项   对应的长选项
-c        --community=<参数>
-d        --daemon
-h        --help
-l        --supernode-list=<参数>
-v        --verbose
-V        --version
```

#### n3n-supernode

```
./n3n-portfwd

n3n-portfwd [-t <management_port>] [-v] [-V]
  -t <端口> 指定管理端口（默认：5644），需要与 edge 的管理端口配置匹配
  -v 增加详细输出级别
  -V 降低详细输出级别
```

----

### 程序介绍：

| 名称 | 描述 |
|------|------|
| **n3n-edge** | `边缘节点客户端程序，用于连接到 n3n VPN 网络` |
| **n3n-supernode** | `超级节点服务器程序，用于协调和管理 n3n 网络` |
| **n3n-benchmark** | `性能基准测试工具，用于测试各种算法的性能` |
| **n3n-route** | `路由管理工具，用于设置通过 VPN 网关的路由` |
| **n3n-portfwd** | `端口转发工具，使用 UPnP 和/或 NAT-PMP 协议让路由器转发 edge 端口` |
| **n3n-decode** | `数据包解码工具，用于解密捕获的 n3n 流量` |
| **crypto_helper** | `加密辅助工具，用于调试和测试加密功能` |
| **tests-compress** | `压缩算法测试工具，测试 LZO1X 和 ZSTD 压缩算法` |
| **tests-elliptic** | `椭圆曲线算法测试工具，测试 Curve25519 相关操作` |
| **tests-transform** | `加密变换测试工具，测试各种加密算法的编码/解码功能` |
| **tests-wire** | `线协议测试工具，测试 n3n 协议数据包的编码和解码 ` |
|  **tests-auth** | `认证测试工具，测试认证相关的加密操作` |
-----

### 功能模块介绍：

| 功能模块 | 配置选项 | 作用说明 | 平台支持 |
|------|------|------|------|
| **ZSTD 压缩** | `--with-zstd` | 启用 ZSTD 压缩算法，比 LZO1X 提供更好的压缩比 | 全平台 |
| **OpenSSL 加密** | `--with-openssl` | 使用 OpenSSL 替代内置 AES 实现，支持硬件加速 | 全平台 |
| **AES-NI硬件加速** | 编译器标志 | Intel CPU 的 AES 硬件加速，需要 `-march=native` | x86/x64 |
| **ARMNEON加速** | `-DSPECK_ARM_NEON` | ARM 处理器的 SIMD 加速 | arm |
| **miniUPnP支持** | `--enable-miniupnp` | UPnP 端口转发协议支持 | Linux, macOS, BSD |
| **NAT-PMP 支持** | `--enable-natpmp` | Apple 的 NAT 端口映射协议 | Linux, macOS, BSD |
| **pcap 抓包** | `--enable-pcap` | 数据包捕获功能，用于 n3n-decode 工具 | Linux, macOS, BSD | 
| **pthread 线程** | `--enable-pthread` | 后台 DNS 解析线程 | Unix-like | 
| **Linux capabilities** | `--enable-cap` | 权限丢弃功能，降低运行时权限，无需root | 仅Linux | 
| **多播发现禁用** | `-DSKIP_MULTICAST_PEERS_DISCOVERY` | 禁用多播本地节点发现 | 全平台 | 

> ⚠️ 本仓库的云编译模板里未配置`AES-NI硬件加速` `ARMNEON加速` `多播发现禁用`


