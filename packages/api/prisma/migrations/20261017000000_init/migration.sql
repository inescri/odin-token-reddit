-- CreateTable
CREATE TABLE `Board` (
    `tokenId` VARCHAR(64) NOT NULL,
    `divisibility` INTEGER NOT NULL,
    `decimals` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`tokenId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Thread` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tokenId` VARCHAR(64) NOT NULL,
    `author` VARCHAR(63) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `body` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `editedAt` DATETIME(3) NULL,
    `deleted` BOOLEAN NOT NULL DEFAULT false,
    `score` DECIMAL(40, 0) NOT NULL DEFAULT 0,
    `upCount` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `downCount` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `commentCount` INTEGER UNSIGNED NOT NULL DEFAULT 0,

    INDEX `Thread_tokenId_createdAt_idx`(`tokenId`, `createdAt` DESC),
    INDEX `Thread_tokenId_score_createdAt_idx`(`tokenId`, `score` DESC, `createdAt` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Comment` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `threadId` BIGINT NOT NULL,
    `parentId` BIGINT NULL,
    `author` VARCHAR(63) NOT NULL,
    `body` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `editedAt` DATETIME(3) NULL,
    `deleted` BOOLEAN NOT NULL DEFAULT false,
    `score` DECIMAL(40, 0) NOT NULL DEFAULT 0,
    `upCount` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `downCount` INTEGER UNSIGNED NOT NULL DEFAULT 0,

    INDEX `Comment_threadId_idx`(`threadId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Vote` (
    `voter` VARCHAR(63) NOT NULL,
    `targetKind` ENUM('THREAD', 'COMMENT') NOT NULL,
    `targetId` BIGINT NOT NULL,
    `direction` ENUM('UP', 'DOWN') NOT NULL,
    `weight` DECIMAL(40, 0) NOT NULL,
    `castAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Vote_targetKind_targetId_idx`(`targetKind`, `targetId`),
    PRIMARY KEY (`voter`, `targetKind`, `targetId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PostCooldown` (
    `principal` VARCHAR(63) NOT NULL,
    `lastPostAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`principal`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Thread` ADD CONSTRAINT `Thread_tokenId_fkey` FOREIGN KEY (`tokenId`) REFERENCES `Board`(`tokenId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Comment` ADD CONSTRAINT `Comment_threadId_fkey` FOREIGN KEY (`threadId`) REFERENCES `Thread`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

