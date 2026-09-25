CREATE TABLE `pool_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`state` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `throttle` (
	`key` text PRIMARY KEY NOT NULL,
	`until` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL
);
