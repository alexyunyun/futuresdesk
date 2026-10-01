// 品种配置表(浏览器端):乘数 / 最小变动价 / 保证金率 / 手续费率(单边,万分之名义价值)
// 参数为近似的常规水平,仅用于模拟盘计算,可在「设置」中整体缩放
// node: 新浪期货服务中心的品种节点(getHQFuturesData);sina: 新浪主力连续代码(全站统一以 sina 代码为合约 ID)

export const GROUPS = ['黑色建材', '有色金属', '贵金属', '能源化工', '农产品', '新能源', '金融期货'];

const S = (sym, name, exch, sina, node, mult, tick, margin, fee, group, night = true) =>
  ({ sym, name, exch, sina, node, mult, tick, margin, fee, group, night });

// exch: SHFE 上期所 / INE 能源中心 / DCE 大商所 / CZCE 郑商所 / GFEX 广期所 / CFFEX 中金所
export const PRODUCTS = [
  // —— 黑色建材 ——
  S('rb', '螺纹钢', 'SHFE', 'nf_RB0', 'lwg_qh', 10, 1, 0.09, 1.0, '黑色建材'),
  S('hc', '热卷', 'SHFE', 'nf_HC0', 'rzjb_qh', 10, 1, 0.09, 1.0, '黑色建材'),
  S('ss', '不锈钢', 'SHFE', 'nf_SS0', 'bxg_qh', 5, 5, 0.11, 1.0, '黑色建材'),
  S('i', '铁矿石', 'DCE', 'nf_I0', 'im_qh', 100, 0.5, 0.13, 1.0, '黑色建材'),
  S('jm', '焦煤', 'DCE', 'nf_JM0', 'jm_qh', 60, 0.5, 0.22, 1.4, '黑色建材'),
  S('j', '焦炭', 'DCE', 'nf_J0', 'jm_qh', 100, 0.5, 0.22, 1.4, '黑色建材'),
  S('SF', '硅铁', 'CZCE', 'nf_SF0', '115.SFM', 5, 2, 0.13, 1.0, '黑色建材'),
  S('SM', '锰硅', 'CZCE', 'nf_SM0', '115.SMM', 5, 2, 0.13, 1.0, '黑色建材'),
  S('FG', '玻璃', 'CZCE', 'nf_FG0', '115.FGM', 20, 1, 0.08, 0.6, '黑色建材'),
  S('SA', '纯碱', 'CZCE', 'nf_SA0', '115.SAM', 20, 1, 0.10, 0.7, '黑色建材'),
  // —— 有色金属 ——
  S('cu', '沪铜', 'SHFE', 'nf_CU0', 'tong_qh', 5, 10, 0.10, 0.5, '有色金属'),
  S('al', '沪铝', 'SHFE', 'nf_AL0', 'lv_qh', 5, 5, 0.10, 0.5, '有色金属'),
  S('zn', '沪锌', 'SHFE', 'nf_ZN0', 'xing_qh', 5, 5, 0.10, 0.5, '有色金属'),
  S('pb', '沪铅', 'SHFE', 'nf_PB0', 'qian_qh', 5, 5, 0.11, 0.5, '有色金属'),
  S('ni', '沪镍', 'SHFE', 'nf_NI0', 'ni_qh', 1, 10, 0.13, 1.0, '有色金属'),
  S('sn', '沪锡', 'SHFE', 'nf_SN0', 'xi_qh', 1, 10, 0.13, 1.0, '有色金属'),
  S('ao', '氧化铝', 'SHFE', 'nf_AO0', 'ao_qh', 20, 1, 0.12, 0.8, '有色金属'),
  S('bc', '国际铜', 'INE', 'nf_BC0', 'bc_qh', 5, 10, 0.10, 0.5, '有色金属'),
  // —— 贵金属 ——
  S('au', '沪金', 'SHFE', 'nf_AU0', 'hj_qh', 1000, 0.02, 0.10, 0.5, '贵金属'),
  S('ag', '沪银', 'SHFE', 'nf_AG0', 'by_qh', 15, 1, 0.11, 0.5, '贵金属'),
  // —— 能源化工 ——
  S('sc', '原油', 'INE', 'nf_SC0', 'yy_qh', 1000, 0.1, 0.12, 0.5, '能源化工'),
  S('lu', '低硫燃油', 'INE', 'nf_LU0', 'lu_qh', 10, 1, 0.13, 0.7, '能源化工'),
  S('nr', '20号胶', 'INE', 'nf_NR0', 'ehj_qh', 10, 5, 0.13, 0.7, '能源化工'),
  S('ec', '集运欧线', 'INE', 'nf_EC0', 'ec_qh', 50, 0.1, 0.17, 0.6, '能源化工'),
  S('fu', '燃油', 'SHFE', 'nf_FU0', 'ry_qh', 10, 1, 0.13, 0.7, '能源化工'),
  S('bu', '沥青', 'SHFE', 'nf_BU0', 'lq_qh', 10, 2, 0.12, 0.7, '能源化工'),
  S('ru', '橡胶', 'SHFE', 'nf_RU0', 'xj_qh', 10, 5, 0.11, 0.7, '能源化工'),
  S('br', '丁二烯胶', 'SHFE', 'nf_BR0', 'br_qh', 5, 5, 0.13, 0.7, '能源化工'),
  S('sp', '纸浆', 'SHFE', 'nf_SP0', 'zj_qh', 10, 2, 0.11, 0.5, '能源化工'),
  S('l', '塑料', 'DCE', 'nf_L0', 'lldpe_qh', 5, 1, 0.11, 0.8, '能源化工'),
  S('v', 'PVC', 'DCE', 'nf_V0', 'pvc_qh', 5, 1, 0.11, 0.8, '能源化工'),
  S('pp', '聚丙烯', 'DCE', 'nf_PP0', 'jbx_qh', 5, 1, 0.11, 0.8, '能源化工'),
  S('eg', '乙二醇', 'DCE', 'nf_EG0', 'yec_qh', 10, 1, 0.11, 0.8, '能源化工'),
  S('eb', '苯乙烯', 'DCE', 'nf_EB0', 'byx_qh', 5, 1, 0.13, 0.8, '能源化工'),
  S('pg', 'LPG', 'DCE', 'nf_PG0', 'pg_qh', 20, 1, 0.13, 0.8, '能源化工'),
  S('TA', 'PTA', 'CZCE', 'nf_TA0', '115.TAM', 5, 2, 0.09, 0.6, '能源化工'),
  S('MA', '甲醇', 'CZCE', 'nf_MA0', '115.MAM', 10, 1, 0.10, 0.6, '能源化工'),
  S('UR', '尿素', 'CZCE', 'nf_UR0', '115.URM', 20, 1, 0.09, 0.6, '能源化工'),
  S('PF', '短纤', 'CZCE', 'nf_PF0', '115.PFM', 5, 2, 0.09, 0.6, '能源化工'),
  S('SH', '烧碱', 'CZCE', 'nf_SH0', '115.SHM', 30, 1, 0.13, 0.8, '能源化工'),
  S('PX', '对二甲苯', 'CZCE', 'nf_PX0', '115.PXM', 5, 2, 0.13, 0.8, '能源化工'),
  // —— 农产品 ——
  S('a', '豆一', 'DCE', 'nf_A0', 'dd_qh', 10, 1, 0.09, 0.8, '农产品'),
  S('b', '豆二', 'DCE', 'nf_B0', 'de_qh', 10, 1, 0.09, 0.8, '农产品'),
  S('m', '豆粕', 'DCE', 'nf_M0', 'dp_qh', 10, 1, 0.09, 0.8, '农产品'),
  S('y', '豆油', 'DCE', 'nf_Y0', 'dy_qh', 10, 2, 0.10, 0.8, '农产品'),
  S('p', '棕榈油', 'DCE', 'nf_P0', 'zly_qh', 10, 2, 0.11, 0.8, '农产品'),
  S('c', '玉米', 'DCE', 'nf_C0', 'hym_qh', 10, 1, 0.09, 0.8, '农产品'),
  S('cs', '淀粉', 'DCE', 'nf_CS0', 'ymdf_qh', 10, 1, 0.09, 0.8, '农产品'),
  S('jd', '鸡蛋', 'DCE', 'nf_JD0', 'jd_qh', 10, 1, 0.11, 1.0, '农产品'),
  S('lh', '生猪', 'DCE', 'nf_LH0', 'lh_qh', 16, 5, 0.16, 1.2, '农产品'),
  S('SR', '白糖', 'CZCE', 'nf_SR0', '115.SRM', 10, 1, 0.08, 0.5, '农产品'),
  S('CF', '棉花', 'CZCE', 'nf_CF0', '115.CFM', 5, 5, 0.09, 0.6, '农产品'),
  S('CY', '棉纱', 'CZCE', 'nf_CY0', '115.CYM', 5, 5, 0.10, 0.6, '农产品'),
  S('RM', '菜粕', 'CZCE', 'nf_RM0', '115.RMM', 10, 1, 0.09, 0.6, '农产品'),
  S('OI', '菜油', 'CZCE', 'nf_OI0', '115.OIM', 10, 1, 0.10, 0.6, '农产品'),
  S('AP', '苹果', 'CZCE', 'nf_AP0', '115.APM', 10, 1, 0.11, 0.8, '农产品'),
  S('CJ', '红枣', 'CZCE', 'nf_CJ0', '115.CJM', 5, 5, 0.13, 0.8, '农产品'),
  S('PK', '花生', 'CZCE', 'nf_PK0', '115.PKM', 5, 2, 0.11, 0.8, '农产品'),
  // —— 新能源 ——
  S('si', '工业硅', 'GFEX', 'nf_SI0', 'si_qh', 5, 5, 0.13, 0.8, '新能源'),
  S('lc', '碳酸锂', 'GFEX', 'nf_LC0', 'lc_qh', 1, 20, 0.16, 0.8, '新能源'),
  S('ps', '多晶硅', 'GFEX', 'nf_PS0', 'ps_qh', 5, 5, 0.13, 0.8, '新能源'),
  // —— 金融期货 ——
  S('IF', '沪深300', 'CFFEX', 'CFF_RE_IF0', 'qz_qh', 300, 0.2, 0.12, 0.23, '金融期货', false),
  S('IH', '上证50', 'CFFEX', 'CFF_RE_IH0', 'szgz_qh', 300, 0.2, 0.12, 0.23, '金融期货', false),
  S('IC', '中证500', 'CFFEX', 'CFF_RE_IC0', 'zzgz_qh', 200, 0.2, 0.12, 0.23, '金融期货', false),
  S('IM', '中证1000', 'CFFEX', 'CFF_RE_IM0', 'im_qh', 200, 0.2, 0.12, 0.23, '金融期货', false),
  S('T', '10年国债', 'CFFEX', 'CFF_RE_T0', 'sngz_qh', 10000, 0.005, 0.03, 0.15, '金融期货', false),
  S('TF', '5年国债', 'CFFEX', 'CFF_RE_TF0', 'gz_qh', 10000, 0.005, 0.03, 0.15, '金融期货', false),
  S('TS', '2年国债', 'CFFEX', 'CFF_RE_TS0', 'engz_qh', 20000, 0.002, 0.01, 0.15, '金融期货', false),
  S('TL', '30年国债', 'CFFEX', 'CFF_RE_TL0', 'tl_qh', 10000, 0.01, 0.04, 0.15, '金融期货', false),
];

export const PRODUCT_MAP = new Map(PRODUCTS.map(p => [p.sina, p]));

// 从行情代码解析品种配置:nf_RB0 / CFF_RE_IF2612 / nf_SA2701 → 品种对象 + 是否主力连续
export function parseCode(code) {
  let rest = code;
  if (rest.startsWith('CFF_RE_')) rest = rest.slice(7);
  else if (rest.startsWith('nf_')) rest = rest.slice(3);
  else return null;
  const m = rest.match(/^([A-Za-z]+)(\d*)$/);
  if (!m) return null;
  const p = PRODUCTS.find(x => x.sym.toLowerCase() === m[1].toLowerCase());
  if (!p) return null;
  return { product: p, code, isMain: m[2] === '0' || m[2] === '' };
}

// 数字标签(如 2610 / 610)→ sina 月份合约代码
export function labelToSina(p, label) {
  let d = String(label);
  if (d.length === 3) d = '2' + d;      // 郑商所 3 位:610 → 2610
  const prefix = p.exch === 'CFFEX' ? `CFF_RE_${p.sym}` : `nf_${p.sym.toUpperCase()}`;
  return prefix + d;
}

export function digitsOf(tick) {
  const s = String(tick);
  const i = s.indexOf('.');
  return i === -1 ? 0 : s.length - i - 1;
}
