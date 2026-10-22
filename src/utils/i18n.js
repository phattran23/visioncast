// ── UI language (English / Vietnamese) ───────────────────────────────────────
// The interface language follows the TMDB metadata language chosen in
// Settings, so one choice switches both. Components call `const t = useT()`
// and re-render when the language changes.

import { useState, useEffect, useCallback } from "react";
import { storage, STORAGE_KEYS } from "./storage";

export const LANGUAGES = [
  { id: "en", tmdb: "en-US", label: "English" },
  { id: "vi", tmdb: "vi-VN", label: "Tiếng Việt" },
];

export const LANG_EVENT = "streambert:tmdb-lang-changed";

export function getLang() {
  const tmdb = storage.get(STORAGE_KEYS.TMDB_LANG) || "en-US";
  return tmdb.startsWith("vi") ? "vi" : "en";
}

const DICT = {
  en: {
    // navigation
    "nav.home": "Home",
    "nav.library": "Library",
    "nav.settings": "Settings",
    "nav.search": "Search",
    "nav.back": "Back",
    // home
    "home.upNext": "Up next",
    "home.recommended": "Recommended for you",
    "home.trendingMovies": "Trending movies",
    "home.trendingTV": "Trending series",
    "home.topRated": "Top rated",
    "home.offlineTitle": "No internet connection",
    "home.offlineBody": "Browsing and search need an internet connection. Your library still works offline.",
    "home.retry": "Retry",
    "hero.trending": "Trending",
    "hero.play": "Play",
    "hero.add": "Add {title} to watchlist",
    "hero.remove": "Remove {title} from watchlist",
    "rail.back": "Scroll {title} back",
    "rail.forward": "Scroll {title} forward",
    // media
    "media.movie": "Movie",
    "media.series": "Series",
    "media.continue": "Continue",
    // detail pages
    "detail.play": "Play",
    "detail.restart": "Restart",
    "detail.trailer": "Trailer",
    "detail.save": "Save",
    "detail.saved": "Saved",
    "detail.markWatched": "✓ Mark watched",
    "detail.watched": "Watched",
    "detail.notStarted": "⊘ Not started",
    "detail.back": "Back",
    "detail.unreleased": "🔒 Unreleased",
    "detail.restricted": "🔒 Restricted",
    "detail.episodes": "Episodes",
    "detail.season": "Season",
    "detail.markProgress": "Mark progress:",
    // library
    "library.title": "My Library",
    "library.sub": "Watch history, progress and saved titles",
    "library.continue": "Continue watching",
    "library.watchlist": "Watchlist",
    "library.history": "Watch history",
    "library.emptyTitle": "Nothing here yet",
    "library.emptyBody": "Start watching a movie or series and it will show up here.",
    // search
    "search.placeholder": "Search movies and series…",
    "search.noResults": "No results for “{query}”",
    "search.recent": "Recent searches",
    "search.clear": "Clear all",
    // settings
    "settings.title": "Settings",
    "settings.general": "Language & appearance",
    "settings.language": "Language",
    "settings.languageDesc": "Interface and movie information (titles, descriptions).",
    "settings.appearance": "Appearance",
    "settings.dark": "Dark",
    "settings.light": "Light",
    "settings.parental": "Parental controls",
    "settings.parentalDesc": "Titles rated above this age stay visible but can't be played.",
    "settings.maxAge": "Maximum age rating",
    "settings.noLimit": "No restriction",
    "settings.age": "{age}+",
    "settings.home": "Home page",
    "settings.homeRows": "Rows to show",
    "settings.layout": "Row style",
    "settings.rails": "Rails",
    "settings.grid": "Grid",
    "settings.startPage": "Open on start",
    "settings.library": "Library & privacy",
    "settings.sort": "Sort watchlist by",
    "settings.sortManual": "Order added",
    "settings.sortTitle": "Title A–Z",
    "settings.sortRating": "Top rated",
    "settings.sortYear": "Newest first",
    "settings.history": "Save watch history",
    "settings.historyDesc": "Keep track of what you watch for Continue watching and recommendations.",
    "settings.saved": "Saved",
    // home rows (settings)
    "row.continue": "Up next",
    "row.recommended": "Recommended for you",
    "row.trendingMovies": "Trending movies",
    "row.trendingTV": "Trending series",
    "row.topRated": "Top rated",
  },
  vi: {
    "nav.home": "Trang chủ",
    "nav.library": "Thư viện",
    "nav.settings": "Cài đặt",
    "nav.search": "Tìm kiếm",
    "nav.back": "Quay lại",
    "home.upNext": "Xem tiếp",
    "home.recommended": "Đề xuất cho bạn",
    "home.trendingMovies": "Phim lẻ thịnh hành",
    "home.trendingTV": "Phim bộ thịnh hành",
    "home.topRated": "Đánh giá cao nhất",
    "home.offlineTitle": "Không có kết nối internet",
    "home.offlineBody": "Duyệt và tìm kiếm cần kết nối internet. Thư viện của bạn vẫn dùng được khi ngoại tuyến.",
    "home.retry": "Thử lại",
    "hero.trending": "Thịnh hành",
    "hero.play": "Phát",
    "hero.add": "Thêm {title} vào danh sách xem",
    "hero.remove": "Xóa {title} khỏi danh sách xem",
    "rail.back": "Cuộn {title} về trước",
    "rail.forward": "Cuộn {title} về sau",
    "media.movie": "Phim lẻ",
    "media.series": "Phim bộ",
    "media.continue": "Xem tiếp",
    "detail.play": "Phát",
    "detail.restart": "Phát lại",
    "detail.trailer": "Trailer",
    "detail.save": "Lưu",
    "detail.saved": "Đã lưu",
    "detail.markWatched": "✓ Đánh dấu đã xem",
    "detail.watched": "Đã xem",
    "detail.notStarted": "⊘ Chưa xem",
    "detail.back": "Quay lại",
    "detail.unreleased": "🔒 Chưa phát hành",
    "detail.restricted": "🔒 Bị giới hạn",
    "detail.episodes": "Các tập",
    "detail.season": "Mùa",
    "detail.markProgress": "Đánh dấu tiến độ:",
    "library.title": "Thư viện của tôi",
    "library.sub": "Lịch sử xem, tiến độ và phim đã lưu",
    "library.continue": "Xem tiếp",
    "library.watchlist": "Danh sách xem",
    "library.history": "Lịch sử xem",
    "library.emptyTitle": "Chưa có gì ở đây",
    "library.emptyBody": "Hãy bắt đầu xem một bộ phim, nó sẽ xuất hiện ở đây.",
    "search.placeholder": "Tìm phim lẻ, phim bộ…",
    "search.noResults": "Không tìm thấy kết quả cho “{query}”",
    "search.recent": "Tìm kiếm gần đây",
    "search.clear": "Xóa tất cả",
    "settings.title": "Cài đặt",
    "settings.general": "Ngôn ngữ & giao diện",
    "settings.language": "Ngôn ngữ",
    "settings.languageDesc": "Giao diện và thông tin phim (tên, mô tả).",
    "settings.appearance": "Giao diện",
    "settings.dark": "Tối",
    "settings.light": "Sáng",
    "settings.parental": "Kiểm soát của phụ huynh",
    "settings.parentalDesc": "Phim vượt quá độ tuổi này vẫn hiển thị nhưng không thể phát.",
    "settings.maxAge": "Độ tuổi tối đa",
    "settings.noLimit": "Không giới hạn",
    "settings.age": "{age}+",
    "settings.home": "Trang chủ",
    "settings.homeRows": "Các hàng hiển thị",
    "settings.layout": "Kiểu hiển thị",
    "settings.rails": "Hàng cuộn",
    "settings.grid": "Lưới",
    "settings.startPage": "Mở khi khởi động",
    "settings.library": "Thư viện & quyền riêng tư",
    "settings.sort": "Sắp xếp danh sách xem theo",
    "settings.sortManual": "Thứ tự đã thêm",
    "settings.sortTitle": "Tên A–Z",
    "settings.sortRating": "Đánh giá cao",
    "settings.sortYear": "Mới nhất",
    "settings.history": "Lưu lịch sử xem",
    "settings.historyDesc": "Ghi lại những gì bạn xem để dùng cho Xem tiếp và đề xuất.",
    "settings.saved": "Đã lưu",
    "row.continue": "Xem tiếp",
    "row.recommended": "Đề xuất cho bạn",
    "row.trendingMovies": "Phim lẻ thịnh hành",
    "row.trendingTV": "Phim bộ thịnh hành",
    "row.topRated": "Đánh giá cao nhất",
  },
};

export function translate(lang, key, vars) {
  let s = DICT[lang]?.[key] ?? DICT.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return s;
}

export function useLang() {
  const [lang, setLang] = useState(getLang);
  useEffect(() => {
    const onChange = () => setLang(getLang());
    window.addEventListener(LANG_EVENT, onChange);
    return () => window.removeEventListener(LANG_EVENT, onChange);
  }, []);
  return lang;
}

export function useT() {
  const lang = useLang();
  return useCallback((key, vars) => translate(lang, key, vars), [lang]);
}
