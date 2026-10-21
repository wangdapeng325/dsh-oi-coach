/**
 * 信奥知识图谱：阶段 → 知识点。
 *
 * 数据是插件内置的"稳定事实层"：路线图工具（xinao_plan）直接由它推导，
 * 知识点讲解工具（xinao_knowledge）用它做匹配、给出前置知识与讲解大纲；
 * 具体的讲解文字、题目表述由模型基于这些事实展开。
 *
 * 本模块不依赖任何框架/第三方库，只使用标准类型。
 */
export const STAGE_IDS = ['entry', 'j', 's', 'province', 'noi'];
export const STAGES = [
    {
        info: {
            id: 'entry',
            title: '入门',
            altNames: ['零基础', '语法', 'C++入门', 'GESP 1-4'],
            description: '零基础到会写程序：掌握 C++ 语法与基础算法，能独立完成 100~300 行的模拟/简单题。',
            goals: [
                '熟练 C++ 基础语法与常用 STL 容器',
                '能用模拟、枚举、贪心解决简单问题',
                '掌握递归、搜索、二分、前缀和等基础算法',
                '养成读题、对拍、调试的习惯',
            ],
        },
        points: [
            { id: 'entry-syntax', name: 'C++ 语法基础', keywords: ['语法', 'syntax', '变量', '输入输出', 'cin', 'cout'], prerequisites: [], weeks: 2, difficulty: 1, description: '变量与类型、输入输出、运算符、类型转换等语言地基。', note: '不要死记硬背，每个语法点配一道小题立即练手。' },
            { id: 'entry-control', name: '顺序、分支与循环', keywords: ['分支', '循环', 'if', 'for', 'while', 'switch'], prerequisites: ['entry-syntax'], weeks: 1, difficulty: 1, description: 'if/else 分支、for/while 循环、循环嵌套与 break/continue。', note: '重点练习循环边界，例如 i<=n 与 i<n 的差异。' },
            { id: 'entry-array', name: '数组与字符串', keywords: ['数组', '字符串', 'array', 'string', 'char'], prerequisites: ['entry-control'], weeks: 2, difficulty: 1, description: '一维/二维数组、字符数组与 string、常见字符串处理。', note: '警惕数组越界与下标从 0/1 开始的约定。' },
            { id: 'entry-function', name: '函数与递归入门', keywords: ['函数', '递归', 'function', 'recursion', '递归入门'], prerequisites: ['entry-control'], weeks: 1, difficulty: 2, description: '函数封装、参数传递、递归思想与递归树。', note: '递归先画调用栈/递归树，再写代码，避免死循环。' },
            { id: 'entry-struct', name: '结构体与枚举', keywords: ['结构体', 'struct', '枚举类型'], prerequisites: ['entry-array'], weeks: 1, difficulty: 1, description: '结构体组织数据、排序规则的 cmp 写法。', note: '结构体 + sort 是普及组高频组合，务必熟练。' },
            { id: 'entry-simulation', name: '模拟', keywords: ['模拟', 'simulation', '大模拟'], prerequisites: ['entry-array'], weeks: 1, difficulty: 2, description: '按题意逐步实现过程，考的是细心与代码组织。', note: '先写伪代码拆步骤，再落代码；注意边界与取模。' },
            { id: 'entry-high-precision', name: '高精度', keywords: ['高精度', '大数', 'bigint', 'bignum'], prerequisites: ['entry-array', 'entry-function'], weeks: 1, difficulty: 2, description: '用数组模拟大整数加减乘，处理超过 long long 的数。', note: 'C++ 没有内置大数，普及组阶段务必掌握数组模拟。' },
            { id: 'entry-sort', name: '排序基础', keywords: ['排序', 'sort', '冒泡', '选择', '插入'], prerequisites: ['entry-array'], weeks: 1, difficulty: 2, description: '冒泡/选择/插入排序及 sort 函数与比较函数。', note: '理解各排序的稳定性与复杂度，会用 sort + cmp。' },
            { id: 'entry-greedy-intro', name: '贪心入门', keywords: ['贪心', 'greedy'], prerequisites: ['entry-sort'], weeks: 1, difficulty: 3, description: '局部最优推出全局最优：排序后依次决策。', note: '重点：证明贪心正确性（交换论证/归纳），警惕反例。' },
            { id: 'entry-binary-intro', name: '二分查找入门', keywords: ['二分', '二分查找', 'binary'], prerequisites: ['entry-array', 'entry-function'], weeks: 1, difficulty: 2, description: '有序数组中的二分查找与 lower_bound/upper_bound。', note: '手写二分时统一区间写法，避免死循环。' },
            { id: 'entry-stack-queue', name: '栈与队列', keywords: ['栈', '队列', 'stack', 'queue', 'deque'], prerequisites: ['entry-array'], weeks: 1, difficulty: 2, description: '栈、队列、双端队列的语义与 STL 用法。', note: '结合括号匹配、单调队列的直觉去理解。' },
            { id: 'entry-prefix', name: '前缀和与差分', keywords: ['前缀和', '差分', 'prefix', 'difference'], prerequisites: ['entry-array'], weeks: 1, difficulty: 2, description: 'O(1) 区间求和、O(1) 区间加：一维与二维。', note: '差分是区间修改的利器，普及组常考。' },
            { id: 'entry-bit', name: '位运算入门', keywords: ['位运算', 'bit', '按位与', '异或'], prerequisites: ['entry-syntax'], weeks: 1, difficulty: 2, description: '& | ^ ~ << >> 与常见技巧（奇偶、lowbit、枚举子集）。', note: '位运算快且省空间，是状压的前置。' },
            { id: 'entry-search-intro', name: 'DFS/BFS 入门', keywords: ['搜索', 'dfs', 'bfs', '深搜', '广搜'], prerequisites: ['entry-function', 'entry-stack-queue'], weeks: 2, difficulty: 3, description: '深度优先与广度优先遍历，走迷宫、全排列等经典问题。', note: 'BFS 求最短路、DFS 枚举方案，先掌握模板。' },
        ],
    },
    {
        info: {
            id: 'j',
            title: '普及组（CSP-J）',
            altNames: ['CSP-J', '普及', '普及组', 'GESP 5-6'],
            description: '面向 CSP-J / GESP 5-6：掌握常见基础算法与简单数据结构，能稳定做出 1~2 道大题。',
            goals: [
                '熟练掌握排序、二分答案、贪心、DP 入门',
                '掌握并查集、图遍历、最短路、最小生成树',
                '掌握树的基础与数学基础（素数、快速幂）',
                '能独立完成 200~400 行代码的综合性题目',
            ],
        },
        points: [
            { id: 'j-sort-advanced', name: '排序进阶', keywords: ['快排', '归并', '桶排序', '排序进阶'], prerequisites: ['entry-sort'], weeks: 1, difficulty: 2, description: '快速排序、归并排序（含逆序对）、桶排序思想。', note: '归并排序求逆序对是高频考点。' },
            { id: 'j-binary-answer', name: '二分答案', keywords: ['二分答案', '最大化最小值'], prerequisites: ['entry-binary-intro'], weeks: 2, difficulty: 3, description: '对答案二分 + 检查函数，把最优化问题转判定问题。', note: '注意二分的上下界与 check 的单调性论证。' },
            { id: 'j-greedy', name: '贪心进阶', keywords: ['贪心进阶', '区间调度', 'huffman'], prerequisites: ['entry-greedy-intro'], weeks: 1, difficulty: 3, description: '区间选点/调度、哈夫曼、经典贪心模型。', note: '积累常见贪心模型，掌握证明套路。' },
            { id: 'j-dp-intro', name: '动态规划入门', keywords: ['dp', '动态规划', '背包', '线性dp'], prerequisites: ['entry-greedy-intro', 'j-binary-answer'], weeks: 3, difficulty: 4, description: '状态设计与转移：0/1 背包、完全背包、线性 DP。', note: 'DP 三步：状态、转移、初始化。先会写，再谈优化。' },
            { id: 'j-lis-lcs', name: 'LIS 与 LCS', keywords: ['lis', 'lcs', '最长上升子序列', '最长公共子序列'], prerequisites: ['j-dp-intro'], weeks: 1, difficulty: 3, description: '最长上升/公共子序列：O(n²) 与贪心+二分优化。', note: 'LIS 的 nlogn 做法要会证明单调性。' },
            { id: 'j-dfs-backtrack', name: 'DFS 与回溯', keywords: ['回溯', 'backtrack', 'dfs进阶'], prerequisites: ['entry-search-intro'], weeks: 1, difficulty: 3, description: '排列/组合枚举、八皇后等回溯问题。', note: '回溯 = 递归 + 状态还原（撤销）。' },
            { id: 'j-bfs-shortest', name: 'BFS 与最短路基础', keywords: ['bfs最短路', '01bfs'], prerequisites: ['entry-search-intro'], weeks: 1, difficulty: 3, description: 'BFS 求无权图最短路、01-BFS、多源 BFS。', note: 'BFS 首次出队即最短路的条件：边权相同。' },
            { id: 'j-pruning', name: '搜索剪枝', keywords: ['剪枝', 'pruning', '可行性剪枝', '最优性剪枝'], prerequisites: ['j-dfs-backtrack'], weeks: 1, difficulty: 3, description: '可行性/最优性/顺序剪枝，让暴力搜得动。', note: '剪枝顺序影响极大，先想"哪些搜索不可能出解"。' },
            { id: 'j-dsu', name: '并查集', keywords: ['并查集', 'dsu', 'union find', '带权并查集'], prerequisites: ['entry-function'], weeks: 1, difficulty: 3, description: '路径压缩 + 按秩合并，维护连通性与带权关系。', note: '带权并查集（到根距离）能解决相对关系问题。' },
            { id: 'j-graph-intro', name: '图论入门', keywords: ['存图', '图的遍历', '邻接表'], prerequisites: ['entry-search-intro', 'j-dsu'], weeks: 1, difficulty: 3, description: '邻接矩阵/邻接表存图，DFS/BFS 遍历图。', note: '链式前向星或 vector 邻接表二选一熟练。' },
            { id: 'j-dijkstra', name: 'Dijkstra', keywords: ['dijkstra', '最短路', '堆优化'], prerequisites: ['j-graph-intro', 'entry-stack-queue'], weeks: 1, difficulty: 3, description: '单源最短路：朴素与堆优化实现。', note: '只适用于非负权图；优先队列写法要熟练。' },
            { id: 'j-floyd', name: 'Floyd', keywords: ['floyd', '多源最短路'], prerequisites: ['j-graph-intro'], weeks: 1, difficulty: 3, description: 'O(n³) 多源最短路与传递闭包。', note: 'n≤500 时可用；注意循环顺序 k-i-j。' },
            { id: 'j-mst', name: '最小生成树', keywords: ['最小生成树', 'mst', 'kruskal', 'prim'], prerequisites: ['j-dsu', 'j-graph-intro'], weeks: 1, difficulty: 3, description: 'Kruskal 与 Prim：生成连通且总权最小的树。', note: 'Kruskal = 边排序 + 并查集，最常考。' },
            { id: 'j-tree-basics', name: '树基础', keywords: ['二叉树', '树的遍历', 'tree'], prerequisites: ['j-graph-intro'], weeks: 1, difficulty: 2, description: '树的存储与遍历、二叉树性质、最近公共祖先初步。', note: '树是图论与 DP 的共同地基，务必扎实。' },
            { id: 'j-math', name: '数学基础', keywords: ['素数', 'gcd', '快速幂', '质数', '欧几里得'], prerequisites: ['entry-function'], weeks: 1, difficulty: 2, description: '素数判定与筛法、gcd/lcm、快速幂与取模。', note: '快速幂 + 取模是组合数学的基石。' },
            { id: 'j-string-kmp', name: '字符串基础（KMP）', keywords: ['kmp', '字符串匹配'], prerequisites: ['entry-array'], weeks: 1, difficulty: 3, description: 'KMP 单模式匹配与 next 数组。', note: 'next 数组的递推要手推几遍。' },
            { id: 'j-stl', name: 'STL 运用', keywords: ['stl', 'vector', 'map', 'set', 'priority_queue'], prerequisites: ['entry-stack-queue'], weeks: 1, difficulty: 2, description: 'vector/map/set/priority_queue/algorithm 常用操作。', note: '熟记各容器复杂度：set/map 增删查 O(logn)。' },
        ],
    },
    {
        info: {
            id: 's',
            title: '提高组（CSP-S / NOIP）',
            altNames: ['CSP-S', 'NOIP', '提高', '提高组', 'GESP 7-8'],
            description: '面向 CSP-S/NOIP：掌握进阶 DP、数据结构与图论算法，能解决综合难题。',
            goals: [
                '掌握区间/树形/状压/数位 DP 及常见优化',
                '掌握线段树、树状数组、平衡树等数据结构',
                '掌握 Tarjan、网络流、二分图等进阶图论',
                '具备对算法进行复杂度分析与常数优化的能力',
            ],
        },
        points: [
            { id: 's-interval-dp', name: '区间 DP', keywords: ['区间dp', '区间动态规划'], prerequisites: ['j-dp-intro'], weeks: 1, difficulty: 3, description: '以区间为状态的 DP：石子合并、括号序列等。', note: '枚举区间长度 + 断点，注意转移顺序。' },
            { id: 's-tree-dp', name: '树形 DP', keywords: ['树形dp', '树上动态规划'], prerequisites: ['j-tree-basics', 'j-dp-intro'], weeks: 2, difficulty: 4, description: '树上状态设计：最大独立集、树上背包等。', note: '先想"子树需要什么信息"，再定状态。' },
            { id: 's-bitmask-dp', name: '状压 DP', keywords: ['状压', 'bitmask', '状态压缩'], prerequisites: ['entry-bit', 'j-dp-intro'], weeks: 2, difficulty: 4, description: '用二进制表示集合状态：旅行商、覆盖类问题。', note: 'n≤20 是状压的典型规模信号。' },
            { id: 's-digit-dp', name: '数位 DP', keywords: ['数位dp', 'digit dp'], prerequisites: ['j-dp-intro'], weeks: 1, difficulty: 4, description: '按位枚举数字：统计 [l,r] 内满足条件的数。', note: '记忆化 + 上限标志（limit）是核心模板。' },
            { id: 's-dp-opt', name: 'DP 优化', keywords: ['斜率优化', '单调队列优化', '四边形不等式'], prerequisites: ['s-interval-dp'], weeks: 2, difficulty: 5, description: '单调队列、斜率优化、四边形不等式优化。', note: '先能识别"决策单调性"，再套模板。' },
            { id: 's-segment-tree', name: '线段树', keywords: ['线段树', 'segment tree', '懒标记'], prerequisites: ['entry-prefix', 'entry-stack-queue'], weeks: 2, difficulty: 4, description: '区间查询/区间修改、懒标记、动态开点、线段树合并。', note: '务必能手写（build/update/query 三件套）。' },
            { id: 's-fenwick', name: '树状数组', keywords: ['树状数组', 'fenwick', 'bit树'], prerequisites: ['entry-bit', 'entry-prefix'], weeks: 1, difficulty: 3, description: '单点修改、前缀查询，以及求逆序对等应用。', note: '代码极短，但理解 lowbit 更新/查询路径。' },
            { id: 's-sparse-table', name: 'ST 表与 RMQ', keywords: ['st表', 'rmq', '倍增'], prerequisites: ['entry-binary-intro'], weeks: 1, difficulty: 3, description: '倍增预处理静态区间最值，O(1) 查询。', note: '倍增思想贯穿 LCA、ST 表、后缀数组。' },
            { id: 's-balanced-tree', name: '平衡树', keywords: ['平衡树', 'splay', 'treap', 'fhq'], prerequisites: ['j-stl'], weeks: 2, difficulty: 4, description: 'Treap / Splay / FHQ-Treap 与序列操作。', note: '会一种即可；FHQ 无旋 Treap 最易写。' },
            { id: 's-persistent-intro', name: '可持久化入门', keywords: ['可持久化', 'persistent', '主席树', '函数式'], prerequisites: ['s-segment-tree'], weeks: 2, difficulty: 5, description: '可持久化线段树（主席树）：静态区间第 k 小。', note: '理解"共用节点"与版本根数组。' },
            { id: 's-hash', name: '哈希与字符串哈希', keywords: ['哈希', 'hash', '字符串哈希'], prerequisites: ['j-stl', 'entry-array'], weeks: 1, difficulty: 3, description: '哈希表、字符串哈希（自然溢出/双模）。', note: '字符串哈希把子串比较降到 O(1)。' },
            { id: 's-toposort', name: '拓扑排序', keywords: ['拓扑排序', 'toposort', 'dag'], prerequisites: ['j-graph-intro'], weeks: 1, difficulty: 3, description: 'DAG 排序与环检测，配合 DP 求最长路。', note: 'Kahn 算法（入度队列）最常用。' },
            { id: 's-tarjan', name: 'Tarjan 与强连通', keywords: ['tarjan', '强连通分量', 'scc', '割点', '桥'], prerequisites: ['s-toposort'], weeks: 2, difficulty: 4, description: 'SCC/割点/桥，双连通分量。', note: 'dfn/low 数组的含义要彻底搞懂。' },
            { id: 's-shrink', name: '缩点与 DAG', keywords: ['缩点', '缩环', 'dag图'], prerequisites: ['s-tarjan'], weeks: 1, difficulty: 4, description: '强连通缩点后在新 DAG 上跑 DP/最短路。', note: '缩点是"环套 DP"问题的标准套路。' },
            { id: 's-diff-constraint', name: '差分约束', keywords: ['差分约束', 'spfa'], prerequisites: ['s-toposort', 'j-dijkstra'], weeks: 1, difficulty: 4, description: '不等式组转图论最短路/最长路（SPFA）。', note: '每个不等式 x≤y+c 对应一条边 y→x。' },
            { id: 's-maxflow-intro', name: '网络流入门', keywords: ['网络流', '最大流', 'dinic', 'ek'], prerequisites: ['s-toposort', 'j-dijkstra'], weeks: 2, difficulty: 4, description: '最大流 Dinic/ISAP、最小割模型。', note: '最小割 = 最大流，先掌握 Dinic 模板。' },
            { id: 's-bipartite', name: '二分图', keywords: ['二分图', '匈牙利', 'hopcroft'], prerequisites: ['j-dfs-backtrack', 's-maxflow-intro'], weeks: 1, difficulty: 4, description: '判定（染色）、最大匹配（匈牙利/网络流）。', note: '最大匹配、最小点覆盖、最大独立集三者关系。' },
            { id: 's-matrix', name: '矩阵快速幂', keywords: ['矩阵', '矩阵快速幂', '递推加速'], prerequisites: ['j-math'], weeks: 1, difficulty: 3, description: '矩阵乘法与快速幂，加速线性递推。', note: '特征方程/常系数递推转矩阵是经典套路。' },
            { id: 's-combinatorics', name: '组合数学', keywords: ['组合数', '排列', '卡特兰', 'catalan'], prerequisites: ['j-math', 's-matrix'], weeks: 1, difficulty: 3, description: '组合数计算（逆元）、卡特兰数、常见计数模型。', note: '模意义下的组合数 = 阶乘 + 逆元。' },
            { id: 's-inclusion', name: '容斥原理', keywords: ['容斥', 'inclusion-exclusion'], prerequisites: ['s-combinatorics'], weeks: 1, difficulty: 4, description: '集合计数中的容斥与二项式反演入门。', note: '先会画文氏图列式子，再学反演。' },
            { id: 's-game', name: '博弈论入门', keywords: ['博弈', 'sg函数', 'nim', 'game theory'], prerequisites: ['s-combinatorics'], weeks: 1, difficulty: 4, description: 'Nim 博弈、SG 函数、经典博弈模型。', note: 'SG = 子游戏异或，先掌握定义再谈应用。' },
            { id: 's-probability', name: '概率与期望', keywords: ['概率', '期望', 'dp期望'], prerequisites: ['j-dp-intro', 's-combinatorics'], weeks: 1, difficulty: 4, description: '期望 DP、全期望公式、常见概率模型。', note: '期望线性性是无脑拆分的利器。' },
            { id: 's-ac-automaton', name: 'AC 自动机', keywords: ['ac自动机', '多模式匹配'], prerequisites: ['j-string-kmp', 's-toposort'], weeks: 2, difficulty: 5, description: '多模式串匹配：Trie + fail 指针。', note: 'fail 指针 = KMP 的 next 在 Trie 上的推广。' },
            { id: 's-manacher', name: 'Manacher', keywords: ['manacher', '回文'], prerequisites: ['j-string-kmp'], weeks: 1, difficulty: 4, description: 'O(n) 求所有回文半径。', note: '注意奇偶回文统一处理的技巧。' },
            { id: 's-sa-intro', name: '后缀数组入门', keywords: ['后缀数组', 'sa', 'height'], prerequisites: ['j-string-kmp', 's-sparse-table'], weeks: 2, difficulty: 5, description: '倍增法求 SA、height 数组与常见应用。', note: '先背模板，再理解"按排名倍增"的原理。' },
            { id: 's-divide-conquer', name: '分治与 CDQ 入门', keywords: ['分治', 'cdq', '归并分治'], prerequisites: ['j-sort-advanced'], weeks: 1, difficulty: 4, description: '分治思想、三维偏序 CDQ 分治。', note: 'CDQ 把"带修改的偏序"转成静态问题。' },
            { id: 's-geom-intro', name: '计算几何入门', keywords: ['计算几何', '凸包', '叉积', '几何'], prerequisites: ['entry-syntax'], weeks: 1, difficulty: 4, description: '向量叉积、凸包（Andrew/Graham）、点在多边形内。', note: '精度问题：用 double 前先想整数方案。' },
        ],
    },
    {
        info: {
            id: 'province',
            title: '省选',
            altNames: ['省队', '省选', '联合省选'],
            description: '面向省队选拔：掌握高级数据结构、进阶图论与多项式基础，具备现场赛综合能力。',
            goals: [
                '掌握树链剖分、LCT、可持久化等高级数据结构',
                '掌握网络流进阶、圆方树、虚树等进阶图论',
                '掌握 SAM、后缀数组、FFT/NTT 等字符串与多项式',
                '能在大赛中稳定运用"套路 + 数学"解决难题',
            ],
        },
        points: [
            { id: 'p-hld', name: '树链剖分', keywords: ['树链剖分', 'hld', '轻重链'], prerequisites: ['s-segment-tree', 's-sparse-table'], weeks: 2, difficulty: 4, description: '轻重链剖分 + 线段树维护树上路径/子树。', note: '剖分序让树上路径变成 O(logn) 段区间。' },
            { id: 'p-lct', name: '动态树 LCT', keywords: ['lct', '动态树', 'link-cut'], prerequisites: ['p-hld', 's-balanced-tree'], weeks: 2, difficulty: 5, description: 'Link-Cut Tree：支持加边删边与路径信息。', note: 'splay 森林 + 虚实边，务必多画图理解。' },
            { id: 'p-persistent-segtree', name: '可持久化线段树进阶', keywords: ['主席树进阶', '可持久化数组'], prerequisites: ['s-persistent-intro'], weeks: 1, difficulty: 5, description: '可持久化数组/并查集，主席树处理树上路径第 k 小。', note: '树上主席树 = 每个节点继承父亲版本。' },
            { id: 'p-tree-in-tree', name: '树套树', keywords: ['树套树', '线段树套平衡树', '二维偏序'], prerequisites: ['s-segment-tree', 's-balanced-tree'], weeks: 1, difficulty: 5, description: '外层线段树内层平衡树，动态二维问题。', note: '能用整体二分/离线就不要硬写树套树。' },
            { id: 'p-mincost', name: '费用流', keywords: ['费用流', '最小费用最大流', 'zkw'], prerequisites: ['s-maxflow-intro'], weeks: 1, difficulty: 4, description: '最小费用最大流与常见建模。', note: 'SPFA/Dijkstra 增广；注意反向边费用取负。' },
            { id: 'p-maxflow-advanced', name: '网络流进阶', keywords: ['上下界网络流', '最大权闭合', '最小割建模'], prerequisites: ['s-maxflow-intro', 'p-mincost'], weeks: 1, difficulty: 5, description: '上下界流、最大权闭合子图、最小割经典建模。', note: '"收益-代价"类问题优先想最小割模型。' },
            { id: 'p-dominator', name: '支配树', keywords: ['支配树', 'dominator'], prerequisites: ['s-tarjan'], weeks: 1, difficulty: 5, description: '有向图必经点：Lengauer-Tarjan 算法。', note: '了解半支配点理论，背模板。' },
            { id: 'p-round-square', name: '圆方树', keywords: ['圆方树', '点双'], prerequisites: ['s-tarjan'], weeks: 1, difficulty: 5, description: '点双连通分量建圆方树，处理仙人掌/割点问题。', note: '圆方树把图上问题转成树上问题。' },
            { id: 'p-virtual-tree', name: '虚树', keywords: ['虚树', 'virtual tree'], prerequisites: ['p-hld'], weeks: 1, difficulty: 4, description: '关键点 + LCA 建虚树，压缩无用节点。', note: '按 dfn 排序建虚树的栈写法要熟练。' },
            { id: 'p-centroid', name: '点分治', keywords: ['点分治', '点分树', 'centroid'], prerequisites: ['p-hld', 'j-dijkstra'], weeks: 2, difficulty: 5, description: '树分治：统计树上路径类问题。', note: '每层找重心，复杂度 O(nlogn)。' },
            { id: 'p-sam', name: '后缀自动机', keywords: ['后缀自动机', 'sam'], prerequisites: ['s-sa-intro', 's-ac-automaton'], weeks: 2, difficulty: 5, description: 'SAM：本质不同子串数、子串出现次数等。', note: 'endpos 等价类思想是理解关键。' },
            { id: 'p-sa-advanced', name: '后缀数组进阶', keywords: ['后缀数组进阶', 'height应用'], prerequisites: ['s-sa-intro'], weeks: 1, difficulty: 5, description: 'height 的 RMQ/单调栈应用：不同子串、最长公共前缀。', note: 'LCP(i,j) = min(height[i+1..j])。' },
            { id: 'p-pam', name: '回文自动机', keywords: ['回文自动机', 'pam'], prerequisites: ['s-manacher'], weeks: 1, difficulty: 5, description: '回文树：本质不同回文串数、出现次数。', note: '两个根（奇偶长度）的构造要理清。' },
            { id: 'p-poly-basics', name: '多项式基础（FFT/NTT）', keywords: ['fft', 'ntt', '卷积', '多项式乘法'], prerequisites: ['s-matrix', 'p-sam'], weeks: 2, difficulty: 5, description: 'FFT/NTT 加速卷积，多项式的乘法与常用运算。', note: 'NTT 用模数 998244353，先背模板再理解。' },
            { id: 'p-gf', name: '生成函数', keywords: ['生成函数', '母函数'], prerequisites: ['s-combinatorics', 'p-poly-basics'], weeks: 1, difficulty: 5, description: '普通/指数生成函数，用多项式工具做计数。', note: '把组合结构翻译成生成函数是核心技能。' },
            { id: 'p-mobius', name: '莫比乌斯反演', keywords: ['莫比乌斯', '反演', 'mobius'], prerequisites: ['s-inclusion', 'j-math'], weeks: 1, difficulty: 5, description: '莫比乌斯函数与反演、整除分块。', note: '整除分块把 O(n) 求和压到 O(sqrt(n))。' },
            { id: 'p-linear-basis', name: '线性基', keywords: ['线性基', 'xor基'], prerequisites: ['entry-bit', 's-matrix'], weeks: 1, difficulty: 4, description: '异或空间的基：最大异或和、第 k 小异或。', note: '高斯消元思想在异或空间的移植。' },
            { id: 'p-group', name: '群论与置换群', keywords: ['群论', '置换群', 'burnside'], prerequisites: ['s-combinatorics'], weeks: 1, difficulty: 5, description: '置换、循环分解、Burnside 引理。', note: 'Burnside：不动点平均数 = 轨道数。' },
            { id: 'p-plug-dp', name: '插头 DP', keywords: ['插头dp', '轮廓线dp', '连通性dp'], prerequisites: ['s-bitmask-dp'], weeks: 2, difficulty: 5, description: '轮廓线状态压缩 DP：棋盘覆盖、回路计数。', note: '最小表示法处理连通性状态。' },
            { id: 'p-wqs', name: '凸优化 DP（wqs 二分）', keywords: ['wqs二分', '凸优化', '带权二分'], prerequisites: ['s-dp-opt'], weeks: 1, difficulty: 5, description: '给限制项附加权值，用二分消去限制。', note: '要求原问题关于限制数是凸函数。' },
            { id: 'p-overall-binary', name: '整体二分', keywords: ['整体二分', '离线二分'], prerequisites: ['s-divide-conquer'], weeks: 1, difficulty: 5, description: '把所有询问一起二分，配合数据结构批量处理。', note: '与可持久化/树套树是三类"动态第 k 小"解法。' },
            { id: 'p-cdq-advanced', name: 'CDQ 分治进阶', keywords: ['cdq进阶', '三维偏序'], prerequisites: ['s-divide-conquer'], weeks: 1, difficulty: 5, description: '三维偏序、动态问题转静态、CDQ 套 CDQ。', note: '"时间维"分治是离线利器。' },
            { id: 'p-randomized', name: '随机化算法', keywords: ['随机化', '模拟退火', '爬山'], prerequisites: ['s-probability'], weeks: 1, difficulty: 4, description: '模拟退火、爬山、随机哈希判重。', note: '用在"近似最优"或"唯一性判定"类问题。' },
            { id: 'p-geom-advanced', name: '计算几何进阶', keywords: ['半平面交', '旋转卡壳', '最小圆覆盖'], prerequisites: ['s-geom-intro'], weeks: 1, difficulty: 5, description: '半平面交、旋转卡壳、最小圆覆盖。', note: '半平面交注意极角排序与去重。' },
        ],
    },
    {
        info: {
            id: 'noi',
            title: 'NOI / 国家队',
            altNames: ['NOI', '国家队', 'IOI'],
            description: '面向 NOI 与国家队选拔：多项式与计数工具的深水区，追求对算法本质的理解与临场构造。',
            goals: [
                '掌握多项式全家桶与生成函数进阶',
                '掌握复杂组合计数与概率工具',
                '能在未知问题上完成建模、猜想与证明',
                '具备稳定、高速、低失误的现场赛能力',
            ],
        },
        points: [
            { id: 'n-poly-full', name: '多项式全家桶', keywords: ['多项式求逆', '多项式ln', '多项式exp', '多项式开方'], prerequisites: ['p-poly-basics'], weeks: 3, difficulty: 5, description: '求逆/ln/exp/开方/求导积分等全套多项式运算。', note: '以牛顿迭代为主线理解整套算法。' },
            { id: 'n-gf-advanced', name: '生成函数进阶', keywords: ['指数生成函数', '拉格朗日反演'], prerequisites: ['p-gf'], weeks: 2, difficulty: 5, description: 'EGF 组合结构、拉格朗日反演、树计数。', note: '树的计数几乎都走"生成函数 + 反演"。' },
            { id: 'n-minmax', name: 'min-max 容斥', keywords: ['min-max容斥', 'kth容斥'], prerequisites: ['s-inclusion', 's-probability'], weeks: 1, difficulty: 5, description: '最大/最小值的期望互化，k 大扩展。', note: '配合概率生成函数处理"首次出现"类问题。' },
            { id: 'n-stirling', name: '斯特林数与计数', keywords: ['斯特林数', 'stirling', '第二类斯特林'], prerequisites: ['p-gf', 'n-minmax'], weeks: 1, difficulty: 5, description: '两类斯特林数、斯特林反演、多项式变换求法。', note: '第二类斯特林数 = 集合划分数，通项用容斥。' },
            { id: 'n-burnside', name: 'Burnside / Polya', keywords: ['burnside', 'polya', '置换计数'], prerequisites: ['p-group', 'p-gf'], weeks: 1, difficulty: 5, description: '带对称性的计数：轨道计数定理的完整应用。', note: 'Polya 是 Burnside 在染色问题上的特化。' },
            { id: 'n-pgf', name: '概率生成函数', keywords: ['概率生成函数', 'pgf'], prerequisites: ['s-probability', 'n-minmax'], weeks: 1, difficulty: 5, description: '用生成函数做停时/首次事件概率分析。', note: '期望 = PGF 在 1 处的导数。' },
            { id: 'n-dynamic-graph', name: '动态图与 LCT 进阶', keywords: ['动态图', '离线分治图', 'lct进阶'], prerequisites: ['p-lct'], weeks: 1, difficulty: 5, description: '离线分治维护动态连通性、LCT 维护边权最值。', note: '线段树分治 + 可撤销并查集是常用组合。' },
            { id: 'n-centroid-tree', name: '点分树', keywords: ['点分树', '动态点分治'], prerequisites: ['p-centroid'], weeks: 1, difficulty: 5, description: '把点分治的重心树建出来，支持在线修改查询。', note: '每个点维护到各级重心的信息。' },
            { id: 'n-edge-decomp', name: '边分治', keywords: ['边分治', '三度化'], prerequisites: ['p-centroid'], weeks: 1, difficulty: 5, description: '边分治与三度化技巧。', note: '边分治的子树信息合并更干净。' },
            { id: 'n-string-advanced', name: '字符串高级', keywords: ['广义sam', '后缀平衡树', '后缀自动机综合'], prerequisites: ['p-sam', 'p-sa-advanced'], weeks: 1, difficulty: 5, description: '广义 SAM、多串问题、字符串与数据结构结合。', note: '多串问题优先想广义 SAM。' },
            { id: 'n-tree-synthesis', name: '树论综合', keywords: ['树论综合', '树上问题'], prerequisites: ['p-virtual-tree', 'p-centroid'], weeks: 1, difficulty: 5, description: '树上路径/子树/点集问题的综合套路。', note: '"点集-路径"问题通常走虚树或点分治。' },
            { id: 'n-geom-deep', name: '计算几何深水', keywords: ['计算几何深水', '三维几何'], prerequisites: ['p-geom-advanced'], weeks: 1, difficulty: 5, description: '三维几何、凸包算法进阶、几何与数据结构结合。', note: 'NOI 几何题更重建模，代码通常不复杂。' },
            { id: 'n-combinatorial-opt', name: '组合优化', keywords: ['组合优化', '线性规划', '拟阵'], prerequisites: ['s-maxflow-intro', 'p-wqs'], weeks: 1, difficulty: 5, description: '拟阵与贪心、线性规划对偶思想的应用。', note: '拟阵交是省选+的冷门深水区。' },
            { id: 'n-complexity', name: '复杂度与问题归约', keywords: ['复杂度理论', 'np', '归约'], prerequisites: ['s-dp-opt'], weeks: 1, difficulty: 4, description: '多项式时间、NP 类、常见归约直觉。', note: '帮助你判断"这题该不该想多项式解法"。' },
            { id: 'n-construction', name: '构造与思维', keywords: ['构造', '思维题', 'ad-hoc'], prerequisites: [], weeks: 1, difficulty: 4, description: '构造题、找规律、adhoc 题的综合思维训练。', note: '多看题解积累"灵光一现"的套路，别无他法。' },
        ],
    },
];
export function stageById(id) {
    return STAGES.find(stage => stage.info.id === id);
}
/** 归一化一个查询串：小写、去空白。 */
export function normalizeQuery(query) {
    return query.trim().toLowerCase().replace(/[\s_-]+/g, '');
}
/** 在知识图谱中查找一个知识点（按名称/别名/关键词），返回所在阶段与知识点。 */
export function resolveTopic(query) {
    const q = normalizeQuery(query);
    if (q === '')
        return undefined;
    for (const stage of STAGES) {
        for (const point of stage.points) {
            const haystack = [point.name, ...point.keywords].map(normalizeQuery);
            if (haystack.includes(q))
                return { stage, point };
        }
    }
    // 宽松匹配：包含关系
    for (const stage of STAGES) {
        for (const point of stage.points) {
            const haystack = [point.name, ...point.keywords].map(normalizeQuery);
            if (haystack.some(h => h.includes(q) || q.includes(h)))
                return { stage, point };
        }
    }
    return undefined;
}
/** 给出一个查询串的候选知识点名（用于"未找到"时的建议）。 */
export function suggestTopics(query, limit = 5) {
    const q = normalizeQuery(query);
    if (q === '')
        return [];
    const scored = [];
    for (const stage of STAGES) {
        for (const point of stage.points) {
            const haystack = [point.name, ...point.keywords].map(normalizeQuery);
            const best = Math.max(...haystack.map(h => scorePair(q, h)));
            if (best > 0)
                scored.push({ name: `${point.name}（${stage.info.title}）`, score: best });
        }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(entry => entry.name);
}
/** 简单的子序列/包含打分，用于候选排序。 */
function scorePair(query, haystack) {
    if (haystack === query)
        return 100;
    if (haystack.includes(query))
        return 60;
    if (query.includes(haystack))
        return 40;
    // 子序列匹配
    let i = 0;
    for (const ch of query) {
        const idx = haystack.indexOf(ch, i);
        if (idx === -1)
            return 0;
        i = idx + 1;
    }
    return 10;
}
/** 由 from 阶段到 to 阶段（含两端）推导学习路线图。 */
export function buildRoadmap(from, to) {
    const startIndex = STAGE_IDS.indexOf(from);
    const endIndex = STAGE_IDS.indexOf(to);
    const fromIndex = startIndex === -1 ? 0 : startIndex;
    const toIndex = endIndex === -1 ? STAGE_IDS.length - 1 : endIndex;
    const lo = Math.min(fromIndex, toIndex);
    const hi = Math.max(fromIndex, toIndex);
    const stages = [];
    let totalWeeks = 0;
    for (let i = lo; i <= hi; i += 1) {
        const stage = STAGES[i];
        if (stage === undefined)
            continue;
        const topics = stage.points.map(point => ({
            id: point.id,
            name: point.name,
            weeks: point.weeks,
            difficulty: point.difficulty,
            prerequisites: point.prerequisites,
        }));
        const weeks = topics.reduce((sum, topic) => sum + topic.weeks, 0);
        totalWeeks += weeks;
        stages.push({
            id: stage.info.id,
            title: stage.info.title,
            description: stage.info.description,
            topics,
            weeks,
        });
    }
    return {
        from: fromIndex <= toIndex ? from : to,
        to: fromIndex <= toIndex ? to : from,
        stages,
        totalWeeks,
    };
}
