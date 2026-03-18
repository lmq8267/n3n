# [N3N](https://github.com/n42n/n3n)多平台架构的静态二进制程序

采用GitHub的云编译流程，编译的静态二进制程序，方便移植到不同的设备里运行，各种功能模块可选编译。

> ⚠️ 注意：构建矩阵里的`arm64`系列的`BSD` 耗时最长，如不需要可注释掉。（`OpenBSD-arm64编译全功能模块耗时接近2小时35分`）

[在线配置文件生成](https://lmq8267.github.io/n3n) 

### 二进制程序介绍：

- **n3n-edge**
    - `边缘节点客户端程序，用于连接到 n3n VPN 网络`
      
- **n3n-supernode**
    - `超级节点服务器程序，用于协调和管理 n3n 网络`

- **n3n-benchmark**
    - `性能基准测试工具，用于测试各种算法的性能`
 
- **n3n-route**
    - `路由管理工具，用于设置通过 VPN 网关的路由`
 
- **n3n-portfwd**
    - `端口转发工具，使用 UPnP 和/或 NAT-PMP 协议让路由器转发 edge 端口`

- **n3n-decode**
    - `数据包解码工具，用于解密捕获的 n3n 流量`

- **crypto_helper**
    - `加密辅助工具，用于调试和测试加密功能`

- **tests-compress**
    - `压缩算法测试工具，测试 LZO1X 和 ZSTD 压缩算法`
 
- **tests-elliptic**
    - `椭圆曲线算法测试工具，测试 Curve25519 相关操作`
      
- **tests-transform**
     - `加密变换测试工具，测试各种加密算法的编码/解码功能`

- **tests-wire**
    - `线协议测试工具，测试 n3n 协议数据包的编码和解码 `
 
- **tests-auth**
    - `认证测试工具，测试认证相关的加密操作`
