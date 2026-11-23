/**
 * ============================================================
 *  NÓN LÁ COFFEE – ỨNG DỤNG CHẤM CÔNG (Google Apps Script)
 *  Phiên bản 3 – chạy trên bảng tính "CHAM_CONG_Claude"
 * ============================================================
 *  Dùng đúng các trang bạn đã tạo:
 *    • NHANVIEN  : MANV | HOTEN | MatKhau | VaiTro | ViTri | MucLuongTheoGio | TRANGTHAI
 *                  (app tự thêm cột ThietBi ở cuối để khóa 1 tài khoản – 1 điện thoại)
 *    • CALAMVIEC : MaCa | TenCa | GioBatDau | GioKetThuc | ThoiGianNghi (phút)
 *    • CHAMCONG  : ID | MaNV | HoTen | Ngay | CheckIn | CheckOut | SoGioLam | TrangThaiDuyet | GhiChu
 *    • CaiDat    : Khóa | Giá trị | Mô tả
 *  App tìm cột theo TÊN TIÊU ĐỀ, nên bạn có thể đổi thứ tự cột.
 *
 *  - Nhân viên đăng nhập bằng MANV + MatKhau trên điện thoại cá nhân,
 *    app ghi nhớ đăng nhập. Người có VaiTro = Admin vào thẳng màn hình quản lý.
 *  - Vào ca: chọn ca (C1, C2, C3...), app tự ghi "Trễ x phút" / "Về sớm x phút".
 *  - Ra ca: bản ghi chuyển sang "Chờ duyệt"; Admin duyệt / sửa giờ / từ chối.
 *  - Lương = số giờ ĐÃ DUYỆT × MucLuongTheoGio.
 *  - Giờ công chỉ tính TRONG KHUNG CA: đến sớm vẫn tính từ giờ bắt đầu ca,
 *    về muộn chỉ tính đến giờ kết thúc ca (VD ca C3: 18:00 – 23:00).
 *  - Quên bấm ra ca: trong ngày ca vẫn mở (nhân viên vẫn bấm RA CA được).
 *    Sang ngày hôm sau, app ghi cột CheckOut = "Quên ra ca", SoGioLam = đúng độ dài
 *    khung ca (VD C3 18:00–23:00 = 5 giờ), chuyển "Chờ duyệt" để Admin kiểm tra.
 *    Hàm tuDongKetThucCa() chạy mỗi giờ (setup() tự cài) để việc này luôn được làm.
 *  - GPS: Admin lưu vị trí quán + bán kính trong mục Cài đặt. Khi bật "Bắt buộc",
 *    nhân viên chỉ chấm công được khi điện thoại đang ở trong bán kính quanh quán.
 *    Vị trí lúc vào/ra ca được ghi vào cột GPS_Vao / GPS_Ra (app tự thêm cột).
 *
 *  CÁCH CÀI: mở bảng tính → Tiện ích mở rộng → Apps Script → dán Code.gs
 *  và tạo file HTML tên "Index" → chạy setup() → Triển khai ứng dụng web
 *  (Thực thi: Tôi · Truy cập: Bất kỳ ai).
 * ============================================================
 */

var CFG = {
  SS_ID: '1Ymy3WghDmX9TnOrdUAVpp382oWGk291YpxirLxwxmE0', // bảng tính CHAM_CONG_Claude
  SH_NV: 'NHANVIEN',
  SH_CC: 'CHAMCONG',
  SH_CA: 'CALAMVIEC',
  SH_CD: 'CaiDat',
  LONG_SHIFT_HOURS: 14,
  MAX_FAIL: 5,
  LOCK_SECONDS: 900,
  MIN_PASS: 6
};

var ST = { WORKING: 'Đang làm', PENDING: 'Chờ duyệt', OK: 'Đã duyệt', NO: 'Từ chối' };
var QUEN_RA = 'Quên ra ca';      // chữ ghi vào cột CheckOut khi quên bấm ra ca
var NOTE_QUEN = 'Quên chấm ra ca – tính đủ giờ khung ca';

/* Tên tiêu đề được chấp nhận cho mỗi cột (không phân biệt hoa thường, dấu, khoảng trắng) */
var COLS_NV = {
  ma: ['manv', 'manhanvien'], ten: ['hoten', 'ten'], mk: ['matkhau', 'password'],
  vaiTro: ['vaitro'], viTri: ['vitri', 'chucvu'],
  luong: ['mucluongtheogio', 'mucuongtheogio', 'luongtheogio', 'luong'],
  tt: ['trangthai'], tb: ['thietbi']
};
var COLS_CC = {
  id: ['id'], ma: ['manv'], ten: ['hoten'], ngay: ['ngay'], vao: ['checkin', 'giovao'],
  ra: ['checkout', 'giora'], gio: ['sogiolam', 'sogio'], duyet: ['trangthaiduyet', 'duyet'], note: ['ghichu'],
  gpsVao: ['gpsvao', 'vitrivao'], gpsRa: ['gpsra', 'vitrira']
};
var COLS_CA = { ma: ['maca'], ten: ['tenca'], bd: ['giobatdau'], kt: ['gioketthuc'], nghi: ['thoigiannghi'] };

/* ---------------------------- WEB APP ---------------------------- */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Nón Lá Coffee – Chấm công')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover')
    .addMetaTag('mobile-web-app-capable', 'yes')
    .addMetaTag('apple-mobile-web-app-capable', 'yes')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Chạy tay 1 lần: kiểm tra bảng tính, thêm cột ThietBi và cài đặt còn thiếu, cấp quyền. */
function setup() {
  var c = ctx_();
  secret_();
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'tuDongKetThucCa'; });
  if (!has) ScriptApp.newTrigger('tuDongKetThucCa').timeBased().everyHours(1).create();
  var closed = autoCloseDue_();
  var fixed = tinhLaiGioChoDuyet_();
  var emps = getEmployees_();
  var log = ['Bảng tính: ' + c.ss.getUrl(),
    'Múi giờ: ' + c.tz,
    'Nhân viên: ' + emps.length + ' (Admin: ' + emps.filter(isAdmin_).map(function (e) { return e.ma; }).join(', ') + ')',
    'Ca làm việc: ' + getShifts_().map(function (s) { return s.ten + ' ' + s.bd + '-' + s.kt; }).join(' · '),
    'Đã cài tự động kết thúc ca mỗi giờ. Vừa đóng ' + closed + ' ca quên ra, tính lại giờ ' + fixed + ' bản chờ duyệt.'];
  Logger.log(log.join('\n'));
}

function api(action, payload) {
  _ctx = null; _recs = null; _shifts = null; // luôn đọc dữ liệu mới cho mỗi yêu cầu
  try {
    if (action !== 'info') { try { autoCloseDue_(); } catch (x) { /* không chặn thao tác chính */ } }
    var fn = ACTIONS_[action];
    if (!fn) throw new Error('Thao tác không hợp lệ.');
    return { ok: true, data: fn(payload || {}) };
  } catch (e) {
    return { ok: false, error: (e && e.message) ? e.message : String(e), auth: !!(e && e.auth), refresh: !!(e && e.refresh) };
  }
}

var ACTIONS_ = {
  info: info_, login: login_, resume: resume_, changePass: changePass_,
  checkIn: checkIn_, checkOut: checkOut_, history: history_,
  adminToday: adminToday_, adminPending: adminPending_, adminReview: adminReview_, adminApproveMany: adminApproveMany_,
  adminReport: adminReport_, adminEmployees: adminEmployees_, adminSaveEmp: adminSaveEmp_,
  adminResetDevice: adminResetDevice_, adminForceOut: adminForceOut_, adminSettings: adminSettings_
};

/* ------------------------- ĐĂNG NHẬP ------------------------- */

function info_() {
  return { shopName: getSetting_('TenQuan', 'Nón Lá Coffee'), serverNow: Date.now() };
}

function login_(p) {
  return withLock_(function () {
    var user = String(p.user || '').trim();
    if (!user || !p.pass) throw new Error('Vui lòng nhập mã nhân viên và mật khẩu.');
    var dev = checkDevice_(p.deviceId);
    var failKey = 'fail_' + user.toUpperCase();
    checkFailLock_(failKey);
    var e = findEmp_(user);
    if (!e || !checkPass_(e, p.pass)) { addFail_(failKey); throw new Error('Sai mã nhân viên hoặc mật khẩu.'); }
    clearFail_(failKey);
    if (!isActive_(e)) throw new Error('Tài khoản đã ngưng hoạt động. Liên hệ quản lý.');
    bindDevice_(e, dev);
    return { token: makeToken_(e, dev), status: statusFor_(e) };
  });
}

function resume_(p) { return statusFor_(authToken_(p, true)); }

function changePass_(p) {
  return withLock_(function () {
    var e = authToken_(p, true);
    if (!checkPass_(e, p.oldPass)) throw new Error('Mật khẩu hiện tại không đúng.');
    var np = String(p.newPass || '');
    if (np.length < CFG.MIN_PASS) throw new Error('Mật khẩu mới cần ít nhất ' + CFG.MIN_PASS + ' ký tự.');
    if (np === String(p.oldPass)) throw new Error('Mật khẩu mới phải khác mật khẩu cũ.');
    e.mk = hashPass_(e.ma, np);
    setNV_(e.row, 'mk', e.mk, true);
    return { token: makeToken_(e, p.deviceId), status: statusFor_(e) };
  });
}

/* ------------------------- CHẤM CÔNG ------------------------- */

function checkIn_(p) {
  return withLock_(function () {
    var e = authToken_(p);
    var open = openRecordOf_(e.ma);
    if (open) throw new Error('Bạn đang trong ca từ ' + open.vao.slice(0, 5) + ' ngày ' + viDate_(open.ngay) + '. Hãy kết thúc ca trước.');
    var shifts = getShifts_();
    var shift = shifts.filter(function (s) { return s.ma === p.ca; })[0];
    if (shifts.length && !shift) throw new Error('Vui lòng chọn ca làm việc.');
    var gps = checkGps_(p.gps);
    var d = new Date();
    var hms = fmt_(d, 'HH:mm:ss');
    if (shift) {
      var w0 = shiftWindow_(fmt_(d, 'yyyy-MM-dd'), shift);
      if (d.getTime() >= w0.kt) throw new Error(shift.ten + ' đã kết thúc lúc ' + shift.kt + '. Vui lòng chọn đúng ca.');
    }
    var notes = [];
    if (shift) {
      notes.push('[' + shift.ten + ']');
      var late = mins_(hms) - mins_(shift.bd);
      if (late > graceMin_()) notes.push('Trễ ' + late + ' phút');
    }
    if (gps.out) notes.push('Ngoài phạm vi quán');
    if (clean_(p.note)) notes.push(clean_(p.note));
    appendCC_({
      id: 'CC' + fmt_(d, 'yyMMddHHmmss') + '-' + e.ma, ma: e.ma, ten: e.ten,
      ngay: fmt_(d, 'yyyy-MM-dd'), vao: hms, ra: '', gio: '', duyet: ST.WORKING, note: notes.join(' | '),
      gpsVao: gps.text
    });
    var st = statusFor_(e);
    st.gpsDist = gps.dist;
    return st;
  });
}

function checkOut_(p) {
  return withLock_(function () {
    var e = authToken_(p);
    var open = openRecordOf_(e.ma);
    if (!open) {
      var last = getRecords_().filter(function (r) { return r.ma === e.ma; }).pop();
      if (last && last.forgot && Date.now() - tsOf_(last.ngay, '00:00:00') < 3 * 86400000) {
        var err = new Error('Ca ngày ' + viDate_(last.ngay) + ' đã được ghi "Quên ra ca" (tính ' + hm_(last.gio) + ' theo khung ca, chờ quản lý duyệt). Hôm nay bạn chưa vào ca.');
        err.refresh = true; throw err;
      }
      throw new Error('Bạn chưa vào ca nên không thể kết thúc ca.');
    }
    var gps = checkGps_(p.gps);
    closeRecord_(open, new Date(), [gps.out ? 'Ra ca ngoài phạm vi quán' : '', clean_(p.note)].filter(String).join(' | '), ST.PENDING, gps.text);
    var st = statusFor_(e);
    st.gpsDist = gps.dist;
    return st;
  });
}

function history_(p) {
  var e = authToken_(p);
  var month = /^\d{4}-\d{2}$/.test(p.month || '') ? p.month : fmt_(new Date(), 'yyyy-MM');
  var recs = getRecords_().filter(function (r) { return r.ma === e.ma && r.ngay.indexOf(month) === 0; }).reverse();
  var s = summarize_(recs, e.luong);
  s.month = month;
  s.records = recs.map(pub_);
  s.luong = e.luong;
  return s;
}

/* --------------------------- QUẢN LÝ --------------------------- */

function adminToday_(p) {
  authAdmin_(p);
  var day = /^\d{4}-\d{2}-\d{2}$/.test(p.date || '') ? p.date : fmt_(new Date(), 'yyyy-MM-dd');
  var recs = getRecords_().filter(function (r) { return r.ngay === day; });
  var list = [];
  getEmployees_().forEach(function (e) {
    if (isAdmin_(e)) return;
    var rs = recs.filter(function (r) { return r.ma === e.ma; });
    if (!isActive_(e) && !rs.length) return;
    var open = rs.some(isOpen_);
    list.push({
      ma: e.ma, ten: e.ten, viTri: e.viTri,
      status: open ? 'working' : (rs.length ? 'done' : 'absent'),
      sessions: rs.map(pub_), hours: round2_(sum_(rs, 'gio')),
      late: rs.some(function (r) { return /Trễ \d+/.test(r.note); })
    });
  });
  var order = { working: 0, done: 1, absent: 2 };
  list.sort(function (a, b) { return order[a.status] - order[b.status] || a.ten.localeCompare(b.ten); });
  return {
    date: day, list: list, pendingCount: countPending_(),
    counts: {
      working: list.filter(function (x) { return x.status === 'working'; }).length,
      done: list.filter(function (x) { return x.status === 'done'; }).length,
      absent: list.filter(function (x) { return x.status === 'absent'; }).length
    }
  };
}

/** Danh sách cần duyệt: ca "Chờ duyệt" + ca đang mở từ ngày trước (có thể quên ra ca). */
function adminPending_(p) {
  authAdmin_(p);
  var today = fmt_(new Date(), 'yyyy-MM-dd');
  var items = getRecords_().filter(function (r) {
    return r.duyet === ST.PENDING || (isOpen_(r) && r.ngay < today);
  });
  items.sort(function (a, b) { return a.ngay < b.ngay ? -1 : a.ngay > b.ngay ? 1 : a.vao < b.vao ? -1 : 1; });
  return items.map(pub_);
}

/** Sửa giờ / ghi chú và đặt trạng thái cho 1 bản ghi. decision: 'approve' | 'reject' | 'save' */
function adminReview_(p) {
  return withLock_(function () {
    authAdmin_(p);
    var r = recordAt_(p.row, p.id);
    var vao = normHms_(p.vao) || r.vao;
    var ra = p.ra != null && p.ra !== '' ? normHms_(p.ra) : r.ra;
    var forgot = !ra && r.forgot;           // giữ "Quên ra ca" nếu Admin không nhập giờ ra
    if (p.decision === 'approve' && !ra && !forgot) throw new Error('Cần có giờ ra trước khi duyệt.');
    var note = p.note != null ? clean_(p.note) : r.note;
    var sh = shiftOfNote_(note);
    var upd = { vao: vao, ra: ra || (forgot ? QUEN_RA : ''), note: note };
    if (ra) upd.gio = round2_(hoursOf_(r.ngay, vao, ra, sh));
    else if (forgot) upd.gio = round2_(shiftLenH_(sh));
    upd.duyet = p.decision === 'approve' ? ST.OK : p.decision === 'reject' ? ST.NO : ((ra || forgot) ? ST.PENDING : ST.WORKING);
    setCC_(r.row, upd);
    return { pending: adminPending_(p), count: countPending_() };
  });
}

function adminApproveMany_(p) {
  return withLock_(function () {
    authAdmin_(p);
    var all = getRecords_();
    (p.items || []).forEach(function (it) {
      var r = all.filter(function (x) { return x.row === it.row && x.id === it.id; })[0];
      if (r && (r.ra || r.forgot) && r.duyet === ST.PENDING) setCC_(r.row, { duyet: ST.OK, gio: hoursFor_(r) });
    });
    return { pending: adminPending_(p), count: countPending_() };
  });
}

function adminReport_(p) {
  authAdmin_(p);
  var month = /^\d{4}-\d{2}$/.test(p.month || '') ? p.month : fmt_(new Date(), 'yyyy-MM');
  var recs = getRecords_().filter(function (r) { return r.ngay.indexOf(month) === 0; });
  var rows = [];
  getEmployees_().forEach(function (e) {
    var rs = recs.filter(function (r) { return r.ma === e.ma; });
    if (isAdmin_(e) && !rs.length) return;
    if (!isActive_(e) && !rs.length) return;
    var s = summarize_(rs, e.luong);
    s.ma = e.ma; s.ten = e.ten; s.viTri = e.viTri; s.luong = e.luong;
    s.lateCount = rs.filter(function (r) { return /Trễ \d+/.test(r.note); }).length;
    rows.push(s);
  });
  rows.sort(function (a, b) { return b.okHours - a.okHours || a.ten.localeCompare(b.ten); });
  return {
    month: month, rows: rows,
    okHours: round2_(sum_(rows, 'okHours')), pendingHours: round2_(sum_(rows, 'pendingHours')),
    wage: sum_(rows, 'wage'), pendingWage: sum_(rows, 'pendingWage')
  };
}

function adminEmployees_(p) {
  authAdmin_(p);
  return getEmployees_().map(function (e) {
    return {
      ma: e.ma, ten: e.ten, vaiTro: e.vaiTro, viTri: e.viTri, luong: e.luong, tt: e.tt,
      active: isActive_(e), admin: isAdmin_(e),
      tempPass: isTempPass_(e) ? e.mk : '', hasDevice: !!e.tb
    };
  });
}

function adminSaveEmp_(p) {
  return withLock_(function () {
    var me = authAdmin_(p);
    var x = p.emp || {};
    var ten = clean_(x.ten);
    if (!ten) throw new Error('Vui lòng nhập họ tên.');
    var luong = Math.max(0, Number(String(x.luong || 0).replace(/[^\d]/g, '')) || 0);
    var tt = x.tt === 'Nghỉ việc' ? 'Nghỉ việc' : 'Đang làm việc';
    var vaiTro = x.vaiTro === 'Admin' ? 'Admin' : 'Nhân viên';
    var newPass = String(x.newPass || '').trim();
    if (newPass && newPass.length < 4) throw new Error('Mật khẩu tạm cần ít nhất 4 ký tự.');
    var emps = getEmployees_();
    var existing = x.orig ? emps.filter(function (e) { return e.ma === x.orig; })[0] : null;

    if (existing) {
      if (existing.ma === me.ma && (vaiTro !== 'Admin' || tt !== 'Đang làm việc')) {
        throw new Error('Bạn không thể tự bỏ quyền Admin hoặc cho chính mình nghỉ việc.');
      }
      var upd = { ten: ten, viTri: clean_(x.viTri), vaiTro: vaiTro, luong: luong || '', tt: tt };
      setNVObj_(existing.row, upd);
      if (newPass) setNV_(existing.row, 'mk', newPass, true);
    } else {
      if (!newPass) throw new Error('Vui lòng đặt mật khẩu tạm cho nhân viên mới.');
      var ma = String(x.ma || '').trim().toUpperCase() || nextCode_(emps);
      if (!/^[A-Z0-9._-]{2,20}$/.test(ma)) throw new Error('Mã nhân viên chỉ gồm chữ, số, dấu chấm, gạch.');
      if (emps.some(function (e) { return e.ma.toUpperCase() === ma; })) throw new Error('Mã ' + ma + ' đã tồn tại.');
      appendNV_({ ma: ma, ten: ten, mk: newPass, vaiTro: vaiTro, viTri: clean_(x.viTri), luong: luong || '', tt: tt, tb: '' });
    }
    SpreadsheetApp.flush();
    return adminEmployees_(p);
  });
}

function adminResetDevice_(p) {
  return withLock_(function () {
    authAdmin_(p);
    var e = getEmployees_().filter(function (x) { return x.ma === p.ma; })[0];
    if (!e) throw new Error('Không tìm thấy nhân viên.');
    setNV_(e.row, 'tb', '');
    return adminEmployees_(p);
  });
}

function adminForceOut_(p) {
  return withLock_(function () {
    authAdmin_(p);
    var open = openRecordOf_(p.ma);
    if (!open) throw new Error('Nhân viên này không có ca đang mở.');
    closeRecord_(open, new Date(), 'Quản lý kết thúc ca hộ', ST.PENDING);
    return adminToday_(p);
  });
}

function adminSettings_(p) {
  authAdmin_(p);
  var s = p.set || {};
  if (typeof s.khoaThietBi === 'boolean') setSetting_('KhoaThietBi', s.khoaThietBi ? 'Có' : 'Không', 'Có = mỗi tài khoản chỉ dùng trên 1 điện thoại');
  if (typeof s.batDoiMK === 'boolean') setSetting_('BatDoiMatKhau', s.batDoiMK ? 'Có' : 'Không', 'Có = nhân viên phải đặt mật khẩu riêng ở lần đăng nhập đầu');
  if (s.phutTre != null) {
    var n = parseInt(s.phutTre, 10);
    if (isNaN(n) || n < 0 || n > 120) throw new Error('Số phút cho phép trễ phải từ 0 đến 120.');
    setSetting_('PhutChoPhepTre', String(n), 'Vào ca/ra ca lệch quá số phút này sẽ ghi Trễ / Về sớm');
  }
  if (s.tenQuan != null && clean_(s.tenQuan)) setSetting_('TenQuan', clean_(s.tenQuan), 'Tên quán hiển thị trên ứng dụng');
  if (s.viTri != null) {
    var v = String(s.viTri).trim();
    if (v && !parseLatLng_(v)) throw new Error('Tọa độ không hợp lệ. Dạng đúng: 10.776889, 106.700806');
    var ll = parseLatLng_(v);
    setSetting_('ViTriQuan', ll ? ll.lat.toFixed(6) + ',' + ll.lng.toFixed(6) : '', 'Tọa độ GPS của quán (vĩ độ,kinh độ)');
  }
  if (s.banKinh != null) {
    var r = parseInt(s.banKinh, 10);
    if (isNaN(r) || r < 20 || r > 2000) throw new Error('Bán kính phải từ 20 đến 2000 mét.');
    setSetting_('BanKinhGPS', String(r), 'Khoảng cách tối đa (mét) từ quán được phép chấm công');
  }
  if (typeof s.batBuocGPS === 'boolean') setSetting_('BatBuocGPS', s.batBuocGPS ? 'Có' : 'Không', 'Có = chỉ cho chấm công khi đang ở trong bán kính quanh quán');
  return {
    khoaThietBi: deviceLockOn_(), batDoiMK: forceChangeOn_(), phutTre: graceMin_(),
    tenQuan: getSetting_('TenQuan', 'Nón Lá Coffee'), sheetUrl: ctx_().ss.getUrl(),
    shifts: getShifts_(), gps: gpsCfg_()
  };
}

/* ------------------------ NGHIỆP VỤ CHUNG ------------------------ */

function statusFor_(e) {
  var today = fmt_(new Date(), 'yyyy-MM-dd');
  var recs = getRecords_().filter(function (r) { return r.ma === e.ma; });
  var open = recs.filter(isOpen_).pop() || null;
  var todays = recs.filter(function (r) { return r.ngay === today; });
  var shifts = getShifts_();
  return {
    emp: { ma: e.ma, ten: e.ten, viTri: e.viTri, vaiTro: e.vaiTro },
    isAdmin: isAdmin_(e),
    mustChangePass: isTempPass_(e) && forceChangeOn_(),
    open: open ? pub_(open) : null,
    today: todays.map(pub_),
    todayHours: round2_(sum_(todays, 'gio')),
    shifts: shifts,
    suggestedCa: suggestShift_(shifts, fmt_(new Date(), 'HH:mm:ss')),
    pendingCount: isAdmin_(e) ? countPending_() : 0,
    gps: (function () { var g = gpsCfg_(); return { configured: g.configured, required: g.required, radius: g.radius }; })(),
    shopName: getSetting_('TenQuan', 'Nón Lá Coffee'),
    serverNow: Date.now()
  };
}

function closeRecord_(r, d, extraNote, status, gpsText) {
  var hms = fmt_(d, 'HH:mm:ss');
  var shift = shiftOfNote_(r.note);
  var notes = r.note ? [r.note] : [];
  if (shift) {
    var early = Math.round((shiftWindow_(r.ngay, shift).kt - d.getTime()) / 60000);
    if (early > graceMin_()) notes.push('Về sớm ' + early + ' phút');
  }
  var hours = hoursOf_(r.ngay, r.vao, hms, shift);
  if (hours > CFG.LONG_SHIFT_HOURS) notes.push('Ca dài bất thường – kiểm tra lại');
  if (extraNote) notes.push(extraNote);
  var upd = { ra: hms, gio: round2_(hours), duyet: status, note: notes.join(' | ') };
  if (gpsText) upd.gpsRa = gpsText;
  setCC_(r.row, upd);
}

/**
 * Số giờ làm, chỉ tính trong khung ca:
 *   bắt đầu = muộn hơn giữa (giờ vào, giờ bắt đầu ca)
 *   kết thúc = sớm hơn giữa (giờ ra, giờ kết thúc ca)
 *   trừ thời gian nghỉ của ca (phút). Ra < vào → coi như ra ngày hôm sau.
 */
function hoursOf_(ngay, vao, ra, shift) {
  var start = tsOf_(ngay, vao);
  var end = tsOf_(ngay, ra);
  if (end < start) end += 86400000;
  if (shift) {
    var w = shiftWindow_(ngay, shift);
    start = Math.max(start, w.bd);
    end = Math.min(end, w.kt);
  }
  var h = (end - start) / 3600000 - (shift && shift.nghi ? shift.nghi / 60 : 0);
  return Math.max(0, h);
}

/** Thời điểm bắt đầu / kết thúc ca của một ngày (ca qua đêm thì kết thúc sang hôm sau). */
function shiftWindow_(ngay, shift) {
  var bd = tsOf_(ngay, shift.bd + ':00'), kt = tsOf_(ngay, shift.kt + ':00');
  if (kt <= bd) kt += 86400000;
  return { bd: bd, kt: kt };
}

/** Ca còn mở = chưa có giờ ra, chưa bị ghi "Quên ra ca", chưa bị từ chối. */
function isOpen_(r) { return !r.ra && !r.forgot && r.duyet !== ST.NO; }

/** Độ dài khung ca (giờ), đã trừ thời gian nghỉ. */
function shiftLenH_(sh) {
  if (!sh) return 0;
  var w = shiftWindow_('2000-01-01', sh);
  return Math.max(0, (w.kt - w.bd) / 3600000 - (sh.nghi ? sh.nghi / 60 : 0));
}

/** Số giờ của 1 bản ghi đã đóng: quên ra ca → đủ khung ca; còn lại → tính trong khung ca. */
function hoursFor_(r) {
  var sh = shiftOfNote_(r.note);
  return round2_(r.forgot ? shiftLenH_(sh) : hoursOf_(r.ngay, r.vao, r.ra, sh));
}

/** Ca quên ra được đóng khi sang ngày hôm sau (ca qua đêm: sau giờ kết thúc ca). */
function autoEndTs_(r) {
  var endOfDay = tsOf_(r.ngay, '23:59:59') + 1000;
  var sh = shiftOfNote_(r.note);
  return sh ? Math.max(endOfDay, shiftWindow_(r.ngay, sh).kt) : endOfDay;
}

/** Ghi "Quên ra ca" cho các ca còn mở từ ngày trước. Trả về số ca đã đóng. */
function autoCloseDue_() {
  var now = Date.now();
  var due = function (r) { return isOpen_(r) && autoEndTs_(r) <= now; };
  if (!getRecords_().some(due)) return 0;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return 0;
  var n = 0;
  try {
    _recs = null;
    getRecords_().filter(due).forEach(function (r) {
      var note = [r.note, NOTE_QUEN].filter(String).join(' | ');
      setCC_(r.row, { ra: QUEN_RA, gio: round2_(shiftLenH_(shiftOfNote_(r.note))), duyet: ST.PENDING, note: note });
      n++;
    });
  } finally { lock.releaseLock(); }
  return n;
}

/** Chạy bằng trigger mỗi giờ (setup() tự cài): đóng các ca quên bấm ra. */
function tuDongKetThucCa() {
  _ctx = null; _recs = null; _shifts = null;
  autoCloseDue_();
}

/** Tính lại SoGioLam theo khung ca cho các bản "Chờ duyệt" (dùng 1 lần khi nâng cấp). */
function tinhLaiGioChoDuyet_() {
  var n = 0;
  getRecords_().forEach(function (r) {
    if (r.duyet !== ST.PENDING || (!r.ra && !r.forgot)) return;
    var g = hoursFor_(r);
    if (Math.abs(g - r.gio) > 0.005) { setCC_(r.row, { gio: g }); n++; }
  });
  return n;
}

function summarize_(recs, luong) {
  var ok = recs.filter(function (r) { return r.duyet === ST.OK; });
  var pend = recs.filter(function (r) { return r.duyet === ST.PENDING; });
  var okH = sum_(ok, 'gio'), pH = sum_(pend, 'gio');
  var days = {};
  recs.forEach(function (r) { if (r.duyet !== ST.NO) days[r.ngay] = 1; });
  return {
    days: Object.keys(days).length, shifts: recs.length,
    okHours: round2_(okH), pendingHours: round2_(pH),
    rejected: recs.filter(function (r) { return r.duyet === ST.NO; }).length,
    wage: Math.round(okH * (luong || 0)), pendingWage: Math.round(pH * (luong || 0))
  };
}

function suggestShift_(shifts, hms) {
  var now = mins_(hms), best = null, bestD = 1e9;
  shifts.forEach(function (s) {
    var bd = mins_(s.bd), kt = mins_(s.kt);
    if (kt <= bd) kt += 1440;
    if (now >= kt) return;
    var d = Math.abs(now - bd);
    if (d < bestD) { bestD = d; best = s.ma; }
  });
  return best || (shifts[0] ? shifts[0].ma : '');
}

function shiftOfNote_(note) {
  var m = /^\[([^\]]+)\]/.exec(note || '');
  if (!m) return null;
  return getShifts_().filter(function (s) { return s.ten === m[1]; })[0] || null;
}

function countPending_() {
  var today = fmt_(new Date(), 'yyyy-MM-dd');
  return getRecords_().filter(function (r) { return r.duyet === ST.PENDING || (isOpen_(r) && r.ngay < today); }).length;
}

function openRecordOf_(ma) {
  return getRecords_().filter(function (r) { return r.ma === ma && isOpen_(r); }).pop() || null;
}

function nextCode_(emps) {
  var max = 0, prefix = 'NV001.';
  emps.forEach(function (e) {
    var m = /^(NV\d+\.)(\d+)$/i.exec(e.ma);
    if (m) { prefix = m[1].toUpperCase(); max = Math.max(max, parseInt(m[2], 10)); }
  });
  var n = max + 1;
  return prefix + (n < 10 ? '0' + n : String(n));
}

function pub_(r) {
  var sh = shiftOfNote_(r.note), w = sh ? shiftWindow_(r.ngay, sh) : null;
  return { row: r.row, id: r.id, ma: r.ma, ten: r.ten, ngay: r.ngay, vao: r.vao, ra: r.ra, forgot: !!r.forgot, gio: r.gio, duyet: r.duyet, note: r.note,
           ca: (/^\[([^\]]+)\]/.exec(r.note || '') || [])[1] || '', vaoTs: r.vao ? tsOf_(r.ngay, r.vao) : 0,
           gpsVao: r.gpsVao || '', gpsRa: r.gpsRa || '',
           caBd: w ? w.bd : 0, caKt: w ? w.kt : 0, caBdTxt: sh ? sh.bd : '', caKtTxt: sh ? sh.kt : '' };
}

/* ------------------------------ GPS ------------------------------ */

function gpsCfg_() {
  var ll = parseLatLng_(getSetting_('ViTriQuan', ''));
  var radius = parseInt(getSetting_('BanKinhGPS', '100'), 10) || 100;
  return {
    configured: !!ll, lat: ll ? ll.lat : null, lng: ll ? ll.lng : null, radius: radius,
    requiredSetting: getSetting_('BatBuocGPS', 'Có') !== 'Không',
    required: !!ll && getSetting_('BatBuocGPS', 'Có') !== 'Không'
  };
}

function parseLatLng_(v) {
  var m = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(String(v || ''));
  if (!m) return null;
  var lat = +m[1], lng = +m[2];
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat: lat, lng: lng };
}

/** Khoảng cách (mét) giữa 2 tọa độ – công thức Haversine. */
function distM_(a, b, c, d) {
  var R = 6371000, toR = Math.PI / 180;
  var dLat = (c - a) * toR, dLng = (d - b) * toR;
  var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a * toR) * Math.cos(c * toR) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Kiểm tra vị trí khi chấm công. p = {lat, lng, acc} từ điện thoại.
 * Bắt buộc → báo lỗi nếu không có GPS, sai số quá lớn hoặc ở ngoài bán kính.
 * Không bắt buộc → chỉ ghi lại vị trí (nếu có) và đánh dấu "ngoài phạm vi".
 */
function checkGps_(p) {
  var cfg = gpsCfg_();
  if (!cfg.configured) return { text: '', out: false, dist: null };
  var ok = p && isFinite(+p.lat) && isFinite(+p.lng) && Math.abs(+p.lat) <= 90 && Math.abs(+p.lng) <= 180;
  if (!ok) {
    if (cfg.required) throw new Error('Cần bật định vị (GPS) để chấm công tại quán. Hãy cho phép ứng dụng dùng vị trí rồi thử lại.');
    return { text: 'Không có GPS', out: false, dist: null };
  }
  var lat = +p.lat, lng = +p.lng, acc = Math.max(0, Math.round(+p.acc || 0));
  var dist = Math.round(distM_(cfg.lat, cfg.lng, lat, lng));
  var out = dist > cfg.radius + Math.min(acc, cfg.radius);
  if (cfg.required) {
    if (acc > Math.max(150, cfg.radius * 2)) {
      throw new Error('Tín hiệu GPS yếu (sai số khoảng ' + acc + ' m). Hãy bật "Vị trí chính xác", đứng gần cửa hoặc chờ vài giây rồi thử lại.');
    }
    if (out) {
      throw new Error('Bạn đang cách quán khoảng ' + (dist >= 1000 ? (dist / 1000).toFixed(1) + ' km' : dist + ' m') +
        ', ngoài phạm vi cho phép ' + cfg.radius + ' m. Vui lòng chấm công tại quán.');
    }
  }
  return { text: lat.toFixed(6) + ',' + lng.toFixed(6) + ' · cách quán ' + dist + 'm (±' + acc + 'm)', out: out, dist: dist };
}

/* --------------------------- BẢO MẬT --------------------------- */

function authErr_(msg) { var e = new Error(msg); e.auth = true; return e; }

function authToken_(p, allowTemp) {
  var dev = checkDevice_(p.deviceId);
  var tok = String(p.token || '');
  var i = tok.lastIndexOf('~');
  if (i < 1) throw authErr_('Phiên đăng nhập không hợp lệ, vui lòng đăng nhập lại.');
  var ma = tok.slice(0, i);
  var e = getEmployees_().filter(function (x) { return x.ma === ma; })[0];
  if (!e || makeToken_(e, dev) !== tok) throw authErr_('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
  if (!isActive_(e)) throw authErr_('Tài khoản đã ngưng hoạt động.');
  if (!isAdmin_(e) && deviceLockOn_() && e.tb && e.tb !== dev) {
    throw authErr_('Tài khoản đã được gắn với điện thoại khác. Liên hệ quản lý nếu bạn đổi máy.');
  }
  if (!allowTemp && isTempPass_(e) && forceChangeOn_()) throw authErr_('Vui lòng đăng nhập lại và đặt mật khẩu mới.');
  return e;
}

function authAdmin_(p) {
  var e = authToken_(p);
  if (!isAdmin_(e)) throw new Error('Bạn không có quyền quản lý.');
  return e;
}

function bindDevice_(e, dev) {
  if (isAdmin_(e)) return; // Admin được dùng nhiều thiết bị
  if (e.tb && e.tb !== dev && deviceLockOn_()) {
    throw new Error('Tài khoản này đã được gắn với một điện thoại khác. Nếu bạn đổi máy, hãy nhờ quản lý "Gỡ gắn điện thoại".');
  }
  if (e.tb !== dev) { setNV_(e.row, 'tb', dev, true); e.tb = dev; }
}

function checkDevice_(dev) {
  dev = String(dev || '');
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(dev)) throw authErr_('Không nhận diện được thiết bị. Vui lòng tải lại trang.');
  return dev;
}

function makeToken_(e, dev) { return e.ma + '~' + hmac_('tok|' + e.ma + '|' + dev + '|' + e.mk).slice(0, 32); }
function hashPass_(ma, pass) { return 'h:' + hmac_('pw|' + ma + '|' + pass); }
function isTempPass_(e) { return String(e.mk).indexOf('h:') !== 0; }
function checkPass_(e, pass) {
  pass = String(pass == null ? '' : pass);
  if (!e.mk) return false;
  if (isTempPass_(e)) return e.mk === pass.trim();
  return e.mk === hashPass_(e.ma, pass);
}

function secret_() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('SECRET', s); }
  return s;
}
function hmac_(msg) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(msg, secret_())).replace(/=+$/, '');
}

function checkFailLock_(key) {
  if (Number(CacheService.getScriptCache().get(key) || 0) >= CFG.MAX_FAIL) {
    throw new Error('Nhập sai quá ' + CFG.MAX_FAIL + ' lần. Vui lòng thử lại sau 15 phút.');
  }
}
function addFail_(key) {
  var c = CacheService.getScriptCache();
  c.put(key, String(Number(c.get(key) || 0) + 1), CFG.LOCK_SECONDS);
}
function clearFail_(key) { CacheService.getScriptCache().remove(key); }

function isActive_(e) { return !/nghỉ|nghi viec|ngung/i.test(e.tt); }
function isAdmin_(e) { return /admin|quản lý|quan ly/i.test(e.vaiTro); }
function deviceLockOn_() { return getSetting_('KhoaThietBi', 'Có') !== 'Không'; }
function forceChangeOn_() { return getSetting_('BatDoiMatKhau', 'Có') !== 'Không'; }
function graceMin_() { var n = parseInt(getSetting_('PhutChoPhepTre', '5'), 10); return isNaN(n) ? 5 : n; }

/* ------------------------- ĐỌC / GHI SHEET ------------------------- */

var _ctx = null;
function ctx_() {
  if (_ctx) return _ctx;
  var ss = null;
  try { ss = SpreadsheetApp.openById(CFG.SS_ID); } catch (e) { ss = null; }
  if (!ss) { try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; } }
  if (!ss) throw new Error('Không mở được bảng tính chấm công. Kiểm tra CFG.SS_ID trong Code.gs.');
  var nv = sheet_(ss, CFG.SH_NV), cc = sheet_(ss, CFG.SH_CC), ca = ss.getSheetByName(CFG.SH_CA);
  var cd = ss.getSheetByName(CFG.SH_CD);
  if (!cd) {
    cd = ss.insertSheet(CFG.SH_CD);
    cd.getRange(1, 1, 1, 3).setValues([['Khóa', 'Giá trị', 'Mô tả']]);
  }
  _ctx = {
    ss: ss, tz: ss.getSpreadsheetTimeZone() || 'Asia/Ho_Chi_Minh',
    nv: { sh: nv, c: mapCols_(nv, COLS_NV, ['ma', 'ten', 'mk', 'vaiTro', 'tt'], ['tb'], { tb: 'ThietBi' }) },
    cc: { sh: cc, c: mapCols_(cc, COLS_CC, ['id', 'ma', 'ten', 'ngay', 'vao', 'ra', 'gio', 'duyet', 'note'],
      ['gpsVao', 'gpsRa'], { gpsVao: 'GPS_Vao', gpsRa: 'GPS_Ra' }) },
    ca: ca ? { sh: ca, c: mapCols_(ca, COLS_CA, ['ma', 'ten', 'bd', 'kt'], [], {}) } : null,
    cd: cd
  };
  return _ctx;
}

function sheet_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Không tìm thấy trang "' + name + '" trong bảng tính.');
  return sh;
}

function norm_(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Tìm vị trí cột theo tên tiêu đề. Thiếu cột bắt buộc → báo lỗi; thiếu cột "tự thêm" → thêm ở cuối. */
function mapCols_(sh, spec, required, autoAdd, labels) {
  var lastCol = Math.max(1, sh.getLastColumn());
  var head = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(norm_);
  var c = {}, max = 0;
  Object.keys(spec).forEach(function (k) {
    for (var i = 0; i < head.length; i++) {
      if (head[i] && spec[k].indexOf(head[i]) >= 0) { c[k] = i + 1; break; }
    }
  });
  head.forEach(function (h, i) { if (h) max = i + 1; });
  autoAdd.forEach(function (k) {
    if (!c[k]) {
      max += 1;
      sh.getRange(1, max).setValue(labels[k]);
      sh.getRange(1, max, sh.getMaxRows(), 1).setNumberFormat('@');
      c[k] = max;
    }
  });
  var miss = required.filter(function (k) { return !c[k]; });
  if (miss.length) throw new Error('Trang "' + sh.getName() + '" thiếu cột: ' + miss.map(function (k) { return spec[k][0]; }).join(', '));
  c._w = Math.max.apply(null, Object.keys(c).map(function (k) { return c[k]; }));
  return c;
}

function getEmployees_() {
  var t = ctx_().nv, last = t.sh.getLastRow();
  if (last < 2) return [];
  var vals = t.sh.getRange(2, 1, last - 1, t.c._w).getValues();
  var out = [];
  vals.forEach(function (r, i) {
    var g = function (k) { return t.c[k] ? r[t.c[k] - 1] : ''; };
    var ma = str_(g('ma'));
    if (!ma) return;
    out.push({
      row: i + 2, ma: ma, ten: str_(g('ten')), mk: str_(g('mk')), vaiTro: str_(g('vaiTro')),
      viTri: str_(g('viTri')), luong: Number(g('luong')) || 0, tt: str_(g('tt')) || 'Đang làm việc', tb: str_(g('tb'))
    });
  });
  return out;
}

function findEmp_(user) {
  var key = String(user).trim().toUpperCase();
  return getEmployees_().filter(function (e) { return e.ma.toUpperCase() === key; })[0] || null;
}

function setNV_(row, key, value, asText) {
  var t = ctx_().nv;
  if (!t.c[key]) return;
  var rg = t.sh.getRange(row, t.c[key]);
  if (asText) rg.setNumberFormat('@');
  rg.setValue(value);
}
function setNVObj_(row, obj) { Object.keys(obj).forEach(function (k) { setNV_(row, k, obj[k], k === 'mk'); }); }

function appendNV_(obj) {
  var t = ctx_().nv, row = t.sh.getLastRow() + 1;
  if (t.c.mk) t.sh.getRange(row, t.c.mk).setNumberFormat('@');
  if (t.c.tb) t.sh.getRange(row, t.c.tb).setNumberFormat('@');
  var arr = [];
  for (var i = 0; i < t.c._w; i++) arr.push('');
  Object.keys(obj).forEach(function (k) { if (t.c[k]) arr[t.c[k] - 1] = obj[k]; });
  t.sh.getRange(row, 1, 1, t.c._w).setValues([arr]);
}

var _recs = null;
function getRecords_() {
  if (_recs) return _recs;
  var t = ctx_().cc, last = t.sh.getLastRow();
  if (last < 2) return (_recs = []);
  var vals = t.sh.getRange(2, 1, last - 1, t.c._w).getValues();
  var out = [];
  vals.forEach(function (r, i) {
    var g = function (k) { return t.c[k] ? r[t.c[k] - 1] : ''; };
    var ma = str_(g('ma'));
    if (!ma) return;
    var ngay = toYmd_(g('ngay'));
    if (!ngay) return;
    out.push({
      row: i + 2, id: str_(g('id')), ma: ma, ten: str_(g('ten')), ngay: ngay,
      vao: toHms_(g('vao')), ra: toHms_(g('ra')), gio: Number(g('gio')) || 0,
      forgot: !toHms_(g('ra')) && !(g('ra') instanceof Date) && /qu[eê]n/i.test(String(g('ra') || '')),
      duyet: str_(g('duyet')), note: str_(g('note')), gpsVao: str_(g('gpsVao')), gpsRa: str_(g('gpsRa'))
    });
  });
  return (_recs = out);
}

function recordAt_(row, id) {
  var r = getRecords_().filter(function (x) { return x.row === Number(row); })[0];
  if (!r || (id && r.id !== id)) throw new Error('Bản ghi đã thay đổi, vui lòng tải lại danh sách.');
  return r;
}

function appendCC_(obj) {
  var t = ctx_().cc, row = t.sh.getLastRow() + 1;
  var arr = [];
  for (var i = 0; i < t.c._w; i++) arr.push('');
  Object.keys(obj).forEach(function (k) { if (t.c[k]) arr[t.c[k] - 1] = obj[k]; });
  t.sh.getRange(row, 1, 1, t.c._w).setValues([arr]);
  SpreadsheetApp.flush();
  _recs = null;
}

function setCC_(row, obj) {
  var t = ctx_().cc;
  Object.keys(obj).forEach(function (k) { if (t.c[k]) t.sh.getRange(row, t.c[k]).setValue(obj[k]); });
  SpreadsheetApp.flush();
  _recs = null;
}

var _shifts = null;
function getShifts_() {
  if (_shifts) return _shifts;
  var t = ctx_().ca;
  if (!t || t.sh.getLastRow() < 2) return (_shifts = []);
  var vals = t.sh.getRange(2, 1, t.sh.getLastRow() - 1, t.c._w).getValues();
  _shifts = [];
  vals.forEach(function (r) {
    var g = function (k) { return t.c[k] ? r[t.c[k] - 1] : ''; };
    var ma = str_(g('ma'));
    var bd = toHms_(g('bd')), kt = toHms_(g('kt'));
    if (!ma || !bd || !kt) return;
    _shifts.push({ ma: ma, ten: str_(g('ten')) || ma, bd: bd.slice(0, 5), kt: kt.slice(0, 5), nghi: Number(g('nghi')) || 0 });
  });
  return _shifts;
}

function getSetting_(key, def) {
  var vals = ctx_().cd.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) if (String(vals[i][0]).trim() === key) return str_(vals[i][1]) || def;
  return def;
}

function setSetting_(key, value, desc) {
  var sh = ctx_().cd, vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === key) { sh.getRange(i + 1, 2).setNumberFormat('@').setValue(value); return; }
  }
  var row = sh.getLastRow() + 1;
  sh.getRange(row, 2).setNumberFormat('@');
  sh.getRange(row, 1, 1, 3).setValues([[key, value, desc || '']]);
}

/* ---------------------------- NGÀY GIỜ ---------------------------- */

function fmt_(d, p) { return Utilities.formatDate(d, ctx_().tz, p); }

function str_(v) {
  if (v instanceof Date) return fmt_(v, 'yyyy-MM-dd HH:mm:ss');
  if (typeof v === 'number') return String(v);
  return String(v == null ? '' : v).trim();
}

/** Ô ngày → 'yyyy-MM-dd' (chấp nhận ô kiểu Ngày, chuỗi yyyy-mm-dd hoặc dd/mm/yyyy) */
function toYmd_(v) {
  if (v instanceof Date) return fmt_(v, 'yyyy-MM-dd');
  if (typeof v === 'number' && v > 20000) return Utilities.formatDate(new Date(Math.round((v - 25569) * 86400000)), 'UTC', 'yyyy-MM-dd');
  var s = String(v || '').trim(), m;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return m[1] + '-' + p2_(m[2]) + '-' + p2_(m[3]);
  if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s))) return m[3] + '-' + p2_(m[2]) + '-' + p2_(m[1]);
  return '';
}

/** Ô giờ → 'HH:mm:ss' (chấp nhận ô kiểu Giờ, số thập phân, hoặc chuỗi) */
function toHms_(v) {
  if (v === '' || v == null) return '';
  if (v instanceof Date) return fmt_(v, 'HH:mm:ss');
  if (typeof v === 'number') {
    var sec = Math.round((v % 1) * 86400);
    return p2_(Math.floor(sec / 3600) % 24) + ':' + p2_(Math.floor(sec % 3600 / 60)) + ':' + p2_(sec % 60);
  }
  return normHms_(v);
}

function normHms_(s) {
  var m = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|SA|CH)?/i.exec(String(s || ''));
  if (!m) return '';
  var h = parseInt(m[1], 10), ap = (m[4] || '').toUpperCase();
  if ((ap === 'PM' || ap === 'CH') && h < 12) h += 12;
  if ((ap === 'AM' || ap === 'SA') && h === 12) h = 0;
  if (h > 23 || +m[2] > 59) return '';
  return p2_(h) + ':' + m[2] + ':' + (m[3] || '00');
}

function mins_(hms) { var p = String(hms).split(':'); return (+p[0]) * 60 + (+p[1]); }

function tsOf_(ymd, hms) {
  var off = fmt_(new Date(), 'XXX');
  if (!/^[+-]\d{2}:\d{2}$/.test(off)) off = '+07:00';
  var d = new Date(ymd + 'T' + (hms || '00:00:00') + off);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function viDate_(ymd) { var p = String(ymd).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ymd; }
function p2_(n) { n = String(n); return n.length < 2 ? '0' + n : n; }

/* ---------------------------- TIỆN ÍCH ---------------------------- */

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function clean_(s) { return String(s || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 300); }
function round2_(n) { return Math.round(n * 100) / 100; }
function hm_(h) { var m = Math.round((Number(h) || 0) * 60); return Math.floor(m / 60) + 'h' + p2_(m % 60); }
function sum_(arr, k) { return arr.reduce(function (s, x) { return s + (Number(x[k]) || 0); }, 0); }
