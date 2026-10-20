-- A score is a sum of up to 40-digit weights, so DECIMAL(40,0) can overflow and
-- leave a target unvotable. DECIMAL(65,0) (MySQL's maximum) needs ~10^25 maximum
-- weight votes to fill.
ALTER TABLE `Thread` MODIFY `score` DECIMAL(65, 0) NOT NULL DEFAULT 0;

ALTER TABLE `Comment` MODIFY `score` DECIMAL(65, 0) NOT NULL DEFAULT 0;
