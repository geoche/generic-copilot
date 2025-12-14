import React, { useMemo } from "react";
import { calculateTimelineSizes } from "../../utils/timelineCalculations";
import { formatRelativeTime } from "../../utils/formatters";
import { SessionTimelineProps } from "./../../types";

export const SessionTimeline: React.FC<SessionTimelineProps> = ({ messages, isActive, onMessageClick }) => {
	const barSizes = useMemo(() => calculateTimelineSizes(messages), [messages]);

	return (
		<div className="session-timeline" role="region" aria-label="Session conversation timeline">
			{messages.map((msg, index) => {
				const sizes = barSizes[index];
				const isLastMessage = index === messages.length - 1;
				const isActiveMessage = isActive && isLastMessage;

				return (
					<div
						key={msg.id}
						className={`timeline-bar ${msg.type} ${isActiveMessage ? "active" : ""}`}
						style={{
							height: `${sizes.heightPercent}%`,
							width: `${sizes.width}px`,
						}}
						onClick={() => onMessageClick?.(msg.id)}
						role="button"
						tabIndex={0}
						aria-label={`${msg.type} message at ${formatRelativeTime(msg.timestamp)}, content length: ${msg.contentLength} characters`}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								onMessageClick?.(msg.id);
							}
						}}
					/>
				);
			})}
		</div>
	);
};
