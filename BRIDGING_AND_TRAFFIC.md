# n3n 桥接支持和流量控制说明

## 桥接到物理网卡支持

### 是否支持桥接？

**是的，n3n 完全支持桥接到物理网卡。** 这是 n3n 的核心功能之一。

### 桥接功能特性

#### 1. 编译时支持
```bash
# 默认启用桥接支持
CFLAGS+=-DHAVE_BRIDGING_SUPPORT
```

在 `Makefile` 中默认已启用 `-DHAVE_BRIDGING_SUPPORT` 编译选项。

#### 2. 运行时启用
```bash
# 启用路由/桥接功能
n3n-edge -c mynetwork -k mykey -l supernode:7777 -r

# 或使用配置文件
filter.allow_routing=true
```

`-r` 选项（或 `filter.allow_routing=true`）同时启用：
- **路由功能**：转发非本机目标的数据包
- **桥接功能**：MAC 地址学习和替换

### 桥接工作原理

#### MAC 地址学习机制
```c
// 代码位置: src/edge_utils.c
#ifdef HAVE_BRIDGING_SUPPORT
    // 1. 学习源 MAC 地址和对应的 peer 信息
    // 2. 维护 MAC -> peer 映射表
    // 3. 根据目标 MAC 查找对应的 peer
    // 4. 直接发送到目标 peer（而不是广播）
#endif
```

**工作流程：**
1. **学习阶段**：记录每个 MAC 地址来自哪个 peer
2. **转发阶段**：根据目标 MAC 直接转发到对应 peer
3. **老化机制**：定期清理过期的 MAC 映射
4. **隐私保护**：内部 MAC 在加密数据包中替换，不对外泄露

#### 使用 brctl 桥接示例

**场景：连接两个远程站点的 LAN**

**站点 A（家庭网络 192.168.1.0/24）：**
```bash
# 1. 启动 n3n edge
n3n-edge -c mynetwork -k mykey -l supernode:7777 -r -a 10.0.0.1

# 2. 创建网桥
sudo brctl addbr br0

# 3. 将物理网卡和 n3n 接口加入网桥
sudo brctl addif br0 eth0
sudo brctl addif br0 n3n0

# 4. 配置网桥
sudo ifconfig br0 192.168.1.100 netmask 255.255.255.0 up
sudo ifconfig eth0 0.0.0.0 up
sudo ifconfig n3n0 0.0.0.0 up

# 5. 启用转发
sudo sysctl -w net.ipv4.ip_forward=1
```

**站点 B（办公网络 192.168.2.0/24）：**
```bash
# 类似配置，使用不同的 IP 段
n3n-edge -c mynetwork -k mykey -l supernode:7777 -r -a 10.0.0.2
# ... 桥接配置 ...
```

**结果：** 两个站点的所有设备可以像在同一个局域网中一样通信。

---

## 流量控制机制

### 是否会造成大量网络流量？

**不会，n3n 有多层流量控制机制防止流量泛滥。**

### 1. 广播和组播控制

#### 默认行为
```c
// 默认配置
allow_multicast = false;  // 组播默认禁用
allow_routing = false;    // 路由/桥接默认禁用
```

**组播流量默认被丢弃：**
```c
// src/edge_utils.c
if(!eee->conf.allow_multicast) {
    if(is_multi_broadcast(eth_payload)) {
        traceEvent(TRACE_DEBUG, "Dropping multicast packet");
        ++(eee->stats.tx_multicast_drop);
        return;
    }
}
```

#### 组播类型识别
```c
// src/n2n.c
uint8_t is_multi_broadcast (const n2n_mac_t dest_mac) {
    // 1. 广播地址: FF:FF:FF:FF:FF:FF
    int is_broadcast = (memcmp(broadcast_mac, dest_mac, N2N_MAC_SIZE) == 0);
    
    // 2. IPv4 组播: 01:00:5E:xx:xx:xx
    int is_multicast = (memcmp(multicast_mac, dest_mac, 3) == 0);
    
    // 3. IPv6 组播: 33:33:xx:xx:xx:xx
    int is_ipv6_multicast = (memcmp(ipv6_multicast_mac, dest_mac, 2) == 0);
    
    return is_broadcast || is_multicast || is_ipv6_multicast;
}
```

#### 启用组播的场景
```bash
# 仅在需要时启用（如 IPv6 邻居发现）
n3n-edge -c mynetwork -k mykey -l supernode:7777 \
    -Ofilter.allow_multicast=true
```

**注意：** 启用组播会增加流量，因为组播包会发送到所有 peer。

### 2. MAC 地址学习（减少广播）

**传统网桥问题：**
- 不知道目标 MAC 在哪里 → 广播到所有端口
- 大量广播 → 网络拥塞

**n3n 的解决方案：**
```c
#ifdef HAVE_BRIDGING_SUPPORT
// 1. 维护 MAC -> peer 映射表
struct mac_peer_mapping {
    n2n_mac_t mac;
    struct peer_info *peer;
    time_t last_seen;
};

// 2. 查找目标 peer
if(find_peer_by_mac(dest_mac, &peer)) {
    // 直接发送到目标 peer（单播）
    send_to_peer(peer, packet);
} else {
    // 仅在不知道目标时才广播
    broadcast_to_all_peers(packet);
}
#endif
```

**效果：**
- 初始阶段：少量广播用于学习
- 稳定阶段：几乎全部单播，流量最小化

### 3. 流量过滤规则

#### 基于规则的流量控制
```bash
# 示例：限制特定流量
n3n-edge -c mynetwork -k mykey -l supernode:7777 \
    -Ofilter.rule=192.168.1.0/24,192.168.2.0/24,TCP+,UDP+,ICMP- \
    -Ofilter.rule=0.0.0.0/0,0.0.0.0/0,TCP-,UDP-,ICMP-
```

**规则格式：**
```
src_ip/len:[port_range],dst_ip/len:[port_range],TCP+/-,UDP+/-,ICMP+/-
```

**示例规则：**
```bash
# 1. 只允许特定子网通信
filter.rule=192.168.1.0/24,192.168.2.0/24,TCP+,UDP+,ICMP+

# 2. 阻止大流量协议
filter.rule=0.0.0.0/0,0.0.0.0/0:80,TCP-    # 阻止 HTTP
filter.rule=0.0.0.0/0,0.0.0.0/0:443,TCP-   # 阻止 HTTPS

# 3. 只允许特定端口
filter.rule=192.168.1.0/24,0.0.0.0/0:[22,22],TCP+  # 只允许 SSH
```

### 4. 点对点直连（减少中继流量）

**P2P 优化：**
```c
// 尽可能建立直接连接
if(can_establish_p2p(peer)) {
    // 直接发送，不经过超级节点
    send_direct_to_peer(peer, packet);
} else {
    // 通过超级节点中继
    send_via_supernode(packet);
}
```

**优势：**
- 减少超级节点负载
- 降低延迟
- 节省带宽

### 5. 数据包压缩

```bash
# 启用压缩减少流量
n3n-edge -c mynetwork -k mykey -l supernode:7777 -z1  # LZO 压缩
n3n-edge -c mynetwork -k mykey -l supernode:7777 -z2  # ZSTD 压缩
```

**压缩效果：**
- 文本数据：可压缩 50-70%
- 已压缩数据（如视频）：压缩效果有限
- CPU 开销：轻微增加

---

## 流量统计和监控

### 查看流量统计
```bash
# 通过管理接口查询
curl http://localhost:5644/edges

# 输出示例
{
  "tx_p2p": 12345,           # P2P 发送包数
  "rx_p2p": 12340,           # P2P 接收包数
  "tx_sup": 100,             # 通过超级节点发送
  "rx_sup": 98,              # 通过超级节点接收
  "tx_sup_broadcast": 10,    # 广播包数
  "tx_multicast_drop": 50,   # 丢弃的组播包
  "rx_multicast_drop": 48
}
```

### 关键指标

| 指标 | 说明 | 期望值 |
|------|------|--------|
| `tx_p2p / (tx_p2p + tx_sup)` | P2P 直连率 | > 90% |
| `tx_multicast_drop` | 丢弃的组播包 | 高（如果未启用组播）|
| `tx_sup_broadcast` | 广播包数 | 低（稳定后）|

---

## 流量优化建议

### 1. 最小化广播域
```bash
# 不要桥接不必要的网络
# 只桥接需要互通的子网
```

### 2. 使用 VLAN 隔离
```bash
# 在物理网卡上使用 VLAN
sudo vconfig add eth0 100
sudo brctl addif br0 eth0.100  # 只桥接特定 VLAN
```

### 3. 禁用不必要的协议
```bash
# 禁用组播（除非需要 IPv6 ND）
filter.allow_multicast=false

# 使用流量过滤规则
filter.rule=...
```

### 4. 启用压缩
```bash
# 对于高延迟链路，启用压缩
compression=1  # 或 2
```

### 5. 监控和调优
```bash
# 定期检查统计信息
watch -n 5 'curl -s http://localhost:5644/edges | jq .'

# 分析流量模式
tcpdump -i n3n0 -w capture.pcap
```

---

## 典型场景流量分析

### 场景 1：小型办公室桥接（10 台设备）

**配置：**
- 2 个站点，各 5 台设备
- 禁用组播
- 启用 MAC 学习

**流量特征：**
- 初始学习：~100 包/秒（持续 1-2 分钟）
- 稳定运行：~10-50 包/秒（取决于应用）
- 带宽占用：< 1 Mbps（空闲时）

**结论：** ✅ 流量可控，不会造成问题

### 场景 2：大型网络桥接（100+ 设备）

**配置：**
- 多个站点，大量设备
- 启用组播（IPv6）
- 全网桥接

**流量特征：**
- 广播风暴风险：⚠️ 高
- ARP 流量：~500-1000 包/秒
- 组播流量：~200-500 包/秒
- 带宽占用：5-20 Mbps（持续）

**结论：** ⚠️ 需要优化，建议：
1. 使用 VLAN 分割广播域
2. 禁用不必要的组播
3. 使用流量过滤规则
4. 考虑路由而非桥接

### 场景 3：路由模式（推荐）

**配置：**
- 使用路由而非桥接
- 每个站点独立子网
- 静态路由表

**流量特征：**
- 无广播流量
- 仅必要的单播
- 带宽占用：最小

**结论：** ✅ 最优方案，流量最小

---

## 桥接 vs 路由对比

| 特性 | 桥接模式 | 路由模式 |
|------|---------|---------|
| **配置复杂度** | 中等 | 简单 |
| **广播流量** | 有（可能大量）| 无 |
| **组播流量** | 有 | 可控 |
| **MAC 学习开销** | 有 | 无 |
| **适用场景** | 需要二层互通 | 三层互通即可 |
| **流量开销** | 中-高 | 低 |
| **推荐度** | ⚠️ 小规模 | ✅ 推荐 |

---

## 常见问题

### Q1: 桥接会导致广播风暴吗？
**A:** 可能会，如果：
- 网络规模大（100+ 设备）
- 启用了组播
- 没有使用 VLAN 隔离

**解决方案：**
- 使用路由模式代替桥接
- 分割广播域
- 禁用不必要的组播

### Q2: 如何减少桥接流量？
**A:** 
1. 禁用组播：`filter.allow_multicast=false`
2. 使用流量过滤规则
3. 启用压缩
4. 使用 VLAN 隔离
5. 考虑改用路由模式

### Q3: 桥接性能如何？
**A:**
- **小规模**（< 20 设备）：性能良好
- **中等规模**（20-50 设备）：需要优化
- **大规模**（> 50 设备）：不推荐，建议路由

### Q4: 双栈支持对流量有影响吗？
**A:** 
- **影响很小**：每个 peer 增加 ~40 字节（仅在双栈节点间）
- **优势**：可以选择最优路径（IPv4 或 IPv6）
- **建议**：启用双栈，流量增加可忽略

---

## 总结

### ✅ n3n 支持桥接到物理网卡
- 完整的桥接功能
- MAC 地址学习
- 与 Linux brctl 兼容

### ✅ 流量控制机制完善
- 组播默认禁用
- MAC 学习减少广播
- 流量过滤规则
- P2P 直连优化
- 数据压缩支持

### ⚠️ 注意事项
- **小规模桥接**（< 20 设备）：安全可用
- **大规模桥接**（> 50 设备）：需要优化或改用路由
- **推荐方案**：优先使用路由模式，仅在必要时使用桥接

### 📊 流量预估
- **路由模式**：< 1 Mbps（空闲），按需增加
- **小规模桥接**：1-5 Mbps（包含广播）
- **大规模桥接**：5-20 Mbps（需要优化）

### 🎯 最佳实践
1. 默认使用路由模式
2. 仅在需要二层互通时使用桥接
3. 始终禁用不必要的组播
4. 使用流量过滤规则
5. 监控流量统计
6. 使用 VLAN 分割大型网络

---

## 跨平台桥接支持

### 平台支持概览

**桥接虚拟网卡（n3n TAP 设备）到物理网卡实现二层转发：**

| 平台 | 支持状态 | 实现方式 | 难度 | 推荐度 |
|------|---------|---------|------|--------|
| **Linux** | ✅ 完全支持 | `brctl` / `bridge` 命令 | 简单 | ⭐⭐⭐⭐⭐ |
| **FreeBSD** | ✅ 完全支持 | `ifconfig bridge` | 简单 | ⭐⭐⭐⭐ |
| **macOS** | ⚠️ 部分支持 | 手动配置 | 中等 | ⭐⭐ |
| **Windows** | ❌ 不支持 | TAP 驱动限制 | 不可用 | ❌ |

---

### Linux（完全支持）✅

#### 支持情况
- **完全支持**二层网桥功能
- 使用标准 Linux 网桥工具
- 性能优秀，功能完整
- **生产环境推荐**

#### 实现方式

**方法 1：使用 brctl（传统方式）**
```bash
# 1. 安装 bridge-utils
sudo apt-get install bridge-utils  # Debian/Ubuntu
sudo yum install bridge-utils       # CentOS/RHEL

# 2. 启动 n3n edge
n3n-edge -c mynetwork -k mykey -l supernode:7777 -r -a 10.0.0.1

# 3. 创建网桥
sudo brctl addbr br0

# 4. 将物理网卡和 n3n 接口加入网桥
sudo brctl addif br0 eth0
sudo brctl addif br0 n3n0

# 5. 配置网桥
sudo ifconfig eth0 0.0.0.0 up
sudo ifconfig n3n0 0.0.0.0 up
sudo ifconfig br0 192.168.1.100 netmask 255.255.255.0 up

# 6. 启用转发
sudo sysctl -w net.ipv4.ip_forward=1
```

**方法 2：使用 ip 命令（现代方式）**
```bash
# 1. 启动 n3n edge
n3n-edge -c mynetwork -k mykey -l supernode:7777 -r -a 10.0.0.1

# 2. 创建网桥
sudo ip link add name br0 type bridge

# 3. 将接口加入网桥
sudo ip link set eth0 master br0
sudo ip link set n3n0 master br0

# 4. 启动接口
sudo ip link set eth0 up
sudo ip link set n3n0 up
sudo ip link set br0 up

# 5. 配置 IP
sudo ip addr add 192.168.1.100/24 dev br0

# 6. 启用转发
sudo sysctl -w net.ipv4.ip_forward=1
```

**方法 3：使用 systemd-networkd（自动化）**
```bash
# /etc/systemd/network/br0.netdev
[NetDev]
Name=br0
Kind=bridge

# /etc/systemd/network/br0-bind.network
[Match]
Name=eth0 n3n0

[Network]
Bridge=br0

# /etc/systemd/network/br0.network
[Match]
Name=br0

[Network]
Address=192.168.1.100/24

# 重启 networkd
sudo systemctl restart systemd-networkd
```

#### 验证
```bash
# 查看网桥状态
brctl show
# 或
bridge link show

# 查看网桥 MAC 地址表
brctl showmacs br0

# 查看网桥统计
ip -s link show br0
```

---

### FreeBSD（完全支持）✅

#### 支持情况
- **完全支持**二层网桥功能
- 使用 FreeBSD 原生 bridge 接口
- 性能良好，稳定可靠

#### 实现方式
```bash
# 1. 启动 n3n edge
n3n-edge -c mynetwork -k mykey -l supernode:7777 -r -a 10.0.0.1

# 2. 创建网桥
sudo ifconfig bridge create

# 3. 将接口加入网桥（假设网桥是 bridge0）
sudo ifconfig bridge0 addm em0 addm tap0 up

# 4. 配置 IP
sudo ifconfig bridge0 inet 192.168.1.100 netmask 255.255.255.0

# 5. 启用转发
sudo sysctl net.inet.ip.forwarding=1
```

#### 持久化配置
```bash
# /etc/rc.conf
cloned_interfaces="bridge0"
ifconfig_bridge0="addm em0 addm tap0 inet 192.168.1.100 netmask 255.255.255.0 up"
gateway_enable="YES"
```

#### 验证
```bash
# 查看网桥状态
ifconfig bridge0

# 查看网桥成员
ifconfig bridge0 | grep member
```

---

### macOS（部分支持）⚠️

#### 支持情况
- **理论上支持**，但有限制
- macOS 的 TAP 驱动支持有限
- 需要第三方 TAP 驱动（如 TunTap for macOS）
- 配置复杂，**不推荐用于生产环境**

#### 限制
1. **TAP 驱动问题**：
   - 需要安装第三方驱动（TunTap）
   - 新版 macOS 对内核扩展限制严格
   - 可能需要禁用 SIP（系统完整性保护）

2. **网桥功能限制**：
   - macOS 的 bridge 接口功能有限
   - 不如 Linux 稳定
   - 性能较差

3. **兼容性问题**：
   - macOS 11+ (Big Sur) 对内核扩展限制更严
   - Apple Silicon (M1/M2) 支持有限

#### 实现方式（不推荐）
```bash
# 1. 安装 TunTap 驱动
# 从 https://sourceforge.net/projects/tuntaposx/ 下载安装
# 或使用 Homebrew
brew install --cask tuntap

# 2. 启动 n3n edge
n3n-edge -c mynetwork -k mykey -l supernode:7777 -r -a 10.0.0.1

# 3. 创建网桥（macOS 的 bridge 功能有限）
sudo ifconfig bridge0 create
sudo ifconfig bridge0 addm en0 addm tap0 up

# 4. 配置 IP
sudo ifconfig bridge0 inet 192.168.1.100 netmask 255.255.255.0
```

#### 推荐替代方案
在 macOS 上，**强烈推荐使用路由模式而非桥接模式**：
```bash
# 使用路由模式
n3n-edge -c mynetwork -k mykey -l supernode:7777 -r -a 10.0.0.1

# 配置路由
sudo route add -net 192.168.2.0/24 10.0.0.2

# 启用转发
sudo sysctl -w net.inet.ip.forwarding=1
```

---

### Windows（不支持）❌

#### 支持情况
- **完全不支持**将 TAP 设备桥接到物理网卡
- Windows TAP 驱动的架构限制
- 无法实现真正的二层桥接

#### 技术原因

**Windows TAP 驱动限制：**
1. **驱动架构**：
   - Windows TAP 驱动是 NDIS 中间层驱动
   - 不支持与物理网卡的直接桥接
   - 无法像 Linux 那样创建真正的网桥

2. **Windows 网桥限制**：
   - Windows 的"网桥连接"功能不支持 TAP 设备
   - 只能桥接物理网卡和某些虚拟网卡（如 Hyper-V）
   - TAP 设备被排除在外

3. **权限和驱动签名**：
   - 修改 TAP 驱动需要微软签名
   - 无法轻易修改驱动行为

#### 尝试桥接的结果
```powershell
# 尝试在 Windows 上创建网桥（会失败）
# 控制面板 -> 网络和共享中心 -> 更改适配器设置
# 选择物理网卡和 TAP 设备 -> 右键 -> 桥接连接

# 错误信息：
# "无法桥接连接。所选的一个或多个连接不支持桥接。"
```

#### Windows 上的替代方案

**方案 1：使用路由模式（强烈推荐）**
```powershell
# 1. 启动 n3n edge
n3n-edge.exe -c mynetwork -k mykey -l supernode:7777 -r -a 10.0.0.1

# 2. 启用 IP 转发
# 方法 A：通过注册表
reg add "HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters" /v IPEnableRouter /t REG_DWORD /d 1 /f

# 方法 B：通过网络共享
# 控制面板 -> 网络和共享中心 -> 更改适配器设置
# 右键物理网卡 -> 属性 -> 共享 -> 允许其他网络用户通过此计算机的 Internet 连接来连接

# 3. 配置路由
route add 192.168.2.0 mask 255.255.255.0 10.0.0.2

# 4. 配置 NAT（使用 PowerShell，需要管理员权限）
New-NetNat -Name "n3nNAT" -InternalIPInterfaceAddressPrefix 10.0.0.0/24
```

**方案 2：使用 WSL2 + Linux 桥接（复杂但可行）**
```bash
# 1. 安装 WSL2
wsl --install

# 2. 在 WSL2 中安装 Linux 发行版
wsl --install -d Ubuntu

# 3. 在 WSL2 中运行 n3n 并配置桥接
# （在 WSL2 Linux 环境中按 Linux 方式配置）

# 4. 配置 Windows 路由指向 WSL2
# （需要额外的网络配置）
```

**方案 3：使用虚拟机（最可靠但开销大）**
```
1. 安装 VirtualBox 或 VMware
2. 创建 Linux 虚拟机
3. 在虚拟机中运行 n3n 并配置桥接
4. 配置虚拟机网络为桥接模式
5. 配置 Windows 路由
```

---

## 跨平台对比总结

### 功能对比表

| 功能 | Linux | FreeBSD | macOS | Windows |
|------|-------|---------|-------|---------|
| **二层桥接** | ✅ 完全支持 | ✅ 完全支持 | ⚠️ 有限支持 | ❌ 不支持 |
| **配置难度** | 简单 | 简单 | 中等 | 不可用 |
| **性能** | 优秀 | 良好 | 一般 | N/A |
| **稳定性** | 优秀 | 良好 | 一般 | N/A |
| **生产环境** | ✅ 推荐 | ✅ 推荐 | ⚠️ 不推荐 | ❌ 不可用 |
| **路由模式** | ✅ 支持 | ✅ 支持 | ✅ 支持 | ✅ 支持 |
| **TAP 驱动** | 内核内置 | 内核内置 | 需第三方 | 内置但受限 |
| **文档完善度** | 优秀 | 良好 | 一般 | 一般 |

### 推荐方案

#### 需要二层桥接
```
优先级：
1. Linux（首选）⭐⭐⭐⭐⭐
2. FreeBSD（次选）⭐⭐⭐⭐
3. macOS（不推荐）⭐⭐
4. Windows（不可用，改用路由）❌
```

#### 只需三层互通
```
所有平台都使用路由模式：
- Linux: ✅ 完全支持
- FreeBSD: ✅ 完全支持
- macOS: ✅ 完全支持
- Windows: ✅ 完全支持
```

---

## 为什么 Windows 不支持桥接？

### 技术深层原因

#### 1. TAP 驱动架构差异

**Linux TAP 驱动：**
```
应用程序
    ↓
  TAP 设备（字符设备 /dev/net/tun）
    ↓
  内核网络栈
    ↓
  网桥模块（可以桥接任何网络接口）
    ↓
  物理网卡
```

**Windows TAP 驱动：**
```
应用程序
    ↓
  TAP-Windows 适配器（NDIS 中间层驱动）
    ↓
  NDIS 协议栈
    ↓
  Windows 网桥（只支持特定类型的适配器）
    ↓
  物理网卡
```

#### 2. NDIS 驱动模型限制

Windows 的 NDIS（Network Driver Interface Specification）驱动模型：
- TAP 设备是 NDIS 中间层驱动
- Windows 网桥只能桥接 NDIS 微端口驱动
- TAP 设备不符合网桥的要求
- 这是 Windows 网络架构的根本限制

#### 3. 驱动签名要求

- Windows 要求所有驱动必须有微软签名
- 修改 TAP 驱动以支持桥接需要重新签名
- 个人或小团队无法获得签名
- 即使修改也无法在标准 Windows 上运行

---

## 实际应用建议

### 场景 1：连接两个远程局域网（需要二层互通）

**推荐平台：Linux**
```bash
# 站点 A（Linux）
n3n-edge -c mynetwork -k mykey -l supernode:7777 -r -a 10.0.0.1
sudo brctl addbr br0
sudo brctl addif br0 eth0 n3n0
sudo ifconfig br0 192.168.1.1/24 up

# 站点 B（Linux）
n3n-edge -c mynetwork -k mykey -l supernode:7777 -r -a 10.0.0.2
sudo brctl addbr br0
sudo brctl addif br0 eth0 n3n0
sudo ifconfig br0 192.168.2.1/24 up
```

**如果必须使用 Windows：**
```powershell
# 改用路由模式 + NAT
# 站点 A（Windows）
n3n-edge.exe -c mynetwork -k mykey -l supernode:7777 -r -a 10.0.0.1
route add 192.168.2.0 mask 255.255.255.0 10.0.0.2
New-NetNat -Name "n3nNAT" -InternalIPInterfaceAddressPrefix 10.0.0.0/24

# 站点 B（Windows）
n3n-edge.exe -c mynetwork -k mykey -l supernode:7777 -r -a 10.0.0.2
route add 192.168.1.0 mask 255.255.255.0 10.0.0.1
New-NetNat -Name "n3nNAT" -InternalIPInterfaceAddressPrefix 10.0.0.0/24
```

### 场景 2：远程访问（只需三层互通）

**所有平台都支持（推荐路由模式）：**
```bash
# Linux/macOS/FreeBSD
n3n-edge -c mynetwork -k mykey -l supernode:7777 -r -a 10.0.0.1
sudo ip route add 192.168.2.0/24 via 10.0.0.2

# Windows
n3n-edge.exe -c mynetwork -k mykey -l supernode:7777 -r -a 10.0.0.1
route add 192.168.2.0 mask 255.255.255.0 10.0.0.2
```

### 场景 3：混合平台部署

**最佳实践：**
1. **网关节点使用 Linux**（支持桥接）
2. **客户端可以使用任何平台**（使用路由模式）
3. **避免在 Windows 上做网关**

```
架构示例：
┌─────────────────────────────────────┐
│  站点 A（Linux 网关）               │
│  - 桥接物理网卡和 n3n               │
│  - 192.168.1.0/24 局域网            │
└──────────────┬──────────────────────┘
               │ n3n 虚拟网络
               │
┌──────────────┴──────────────────────┐
│  站点 B（Linux 网关）               │
│  - 桥接物理网卡和 n3n               │
│  - 192.168.2.0/24 局域网            │
└─────────────────────────────────────┘
               │
               ├─ Windows 客户端（路由模式）
               ├─ macOS 客户端（路由模式）
               └─ Linux 客户端（路由模式）
```

---

## 跨平台常见问题

### Q1: 为什么 Linux 支持桥接而 Windows 不支持？
**A:** 
- Linux 的网络栈设计更灵活，TAP 设备是标准的网络接口
- Windows 的 TAP 驱动是 NDIS 中间层驱动，不符合网桥要求
- 这是操作系统架构的根本差异，无法通过软件修改解决

### Q2: Windows 上有没有办法实现类似桥接的功能？
**A:** 
- 使用路由模式 + NAT 可以实现类似效果
- 但这是三层路由，不是真正的二层桥接
- 无法透传广播和组播（如 DHCP、NetBIOS）
- 对于大多数应用场景，路由模式已经足够

### Q3: macOS 上桥接为什么不推荐？
**A:** 
- 需要第三方 TAP 驱动，安装复杂
- 新版 macOS 对内核扩展限制严格（需要禁用 SIP）
- Apple Silicon (M1/M2) 支持有限
- 稳定性和性能不如 Linux
- **强烈推荐使用路由模式**

### Q4: 如果必须在 Windows 上实现二层互通怎么办？
**A:** 
- **方案 1**：在 Windows 上运行 Linux 虚拟机（VirtualBox/VMware）
- **方案 2**：使用 WSL2 + Linux（配置复杂）
- **方案 3**：改用 Linux 作为网关，Windows 作为客户端
- **推荐**：方案 3 最简单可靠

### Q5: 路由模式和桥接模式有什么区别？
**A:** 
- **桥接模式**：二层转发，透传所有以太网帧（包括广播、组播）
- **路由模式**：三层转发，只转发 IP 数据包
- **桥接适用**：需要二层互通的场景（如 DHCP、NetBIOS、广播发现）
- **路由适用**：大多数场景，且跨平台支持更好

### Q6: FreeBSD 和 Linux 的桥接有什么区别？
**A:** 
- **功能**：两者都完全支持，功能相似
- **配置**：命令语法略有不同
- **性能**：Linux 略优，但差异不大
- **推荐**：如果已经使用 FreeBSD，可以放心使用；新部署推荐 Linux

---

## 平台选择建议

### 根据需求选择平台

#### 需要二层桥接
```
✅ 首选：Linux（Ubuntu/Debian/CentOS）
✅ 次选：FreeBSD
⚠️ 不推荐：macOS
❌ 不可用：Windows（改用路由模式）
```

#### 只需三层路由
```
✅ 所有平台都支持
✅ 推荐：使用路由模式，简单可靠
```

#### 混合部署
```
✅ 网关：Linux（支持桥接）
✅ 客户端：任何平台（路由模式）
```

### 根据平台选择方案

#### 已有 Linux 服务器
```
✅ 使用桥接模式
✅ 性能最优，功能最全
```

#### 已有 Windows 服务器
```
✅ 使用路由模式 + NAT
⚠️ 或在 Windows 上运行 Linux 虚拟机
```

#### 已有 macOS 设备
```
✅ 使用路由模式（强烈推荐）
⚠️ 避免使用桥接模式
```

#### 已有 FreeBSD 服务器
```
✅ 使用桥接模式
✅ 性能良好，稳定可靠
```

---

## 总结

### ✅ 支持桥接的平台
- **Linux**：完全支持，推荐使用 ⭐⭐⭐⭐⭐
- **FreeBSD**：完全支持，推荐使用 ⭐⭐⭐⭐

### ⚠️ 有限支持的平台
- **macOS**：理论支持，但不推荐（配置复杂，稳定性差）⭐⭐

### ❌ 不支持桥接的平台
- **Windows**：不支持，改用路由模式 ❌

### 🎯 最佳实践
1. **需要二层桥接**：使用 Linux 或 FreeBSD
2. **只需三层互通**：所有平台都使用路由模式
3. **混合部署**：网关用 Linux，客户端可以用任何平台
4. **Windows 用户**：使用路由模式 + NAT
5. **macOS 用户**：使用路由模式，避免桥接

### 📚 相关文档
- [doc/Bridging.md](doc/Bridging.md) - Linux 桥接配置详细说明
- [doc/Routing.md](doc/Routing.md) - 路由模式配置详细说明
- [doc/Building.md](doc/Building.md) - 各平台编译说明
