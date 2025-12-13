/**
 * Format large numbers for display (e.g., 1.2K, 2.3M)
 */
export const formatLargeNumber = (num: number): string => {
	if (!isFinite(num)) return "0";

	const absNum = Math.abs(num);

	if (absNum >= 1_000_000_000) {
		return (num / 1_000_000_000).toFixed(absNum >= 10_000_000_000 ? 0 : 1) + "B";
	} else if (absNum >= 1_000_000) {
		return (num / 1_000_000).toFixed(absNum >= 10_000_000 ? 0 : 1) + "M";
	} else if (absNum >= 1_000) {
		return (num / 1_000).toFixed(absNum >= 10_000 ? 0 : 1) + "K";
	} else {
		return num.toLocaleString();
	}
};

/**
 * Format timestamps for display in a relative format
 */
export const formatRelativeTime = (timestamp: number | Date): string => {
	const now = new Date().getTime();
	const then = typeof timestamp === "number" ? timestamp : timestamp.getTime();
	const diffMs = now - then;

	const seconds = Math.floor(diffMs / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 0) return `${days}d ago`;
	if (hours > 0) return `${hours}h ago`;
	if (minutes > 0) return `${minutes}m ago`;
	if (seconds > 0) return `${seconds}s ago`;
	return "now";
};
