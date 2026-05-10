// Shared utilities for UX Walkthrough Agent

// Format ISO date string to "MM-DD HH:mm"
function formatDate(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (isNaN(d)) return '—';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${min}`;
}

// Extract domain from URL (strips protocol and www.)
function extractDomain(url) {
  if (!url) return '—';
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// Status badge HTML
function statusBadge(status) {
  const labels = {
    queued: '排队中',
    running: '执行中',
    done: '完成',
    failed: '失败',
    timeout: '超时'
  };
  return `<span class="status-badge ${status}">${labels[status] || status}</span>`;
}

// Time ago in Chinese
function timeAgo(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d)) return '';
  const now = new Date();
  const diffMs = now - d;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return '刚刚';
  if (diffMin < 60) return `${diffMin} 分钟前`;
  if (diffHour < 24) return `${diffHour} 小时前`;
  if (diffDay === 1) return '昨天';
  if (diffDay < 30) return `${diffDay} 天前`;
  return formatDate(isoString);
}
