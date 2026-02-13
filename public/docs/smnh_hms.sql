-- MySQL dump 10.13  Distrib 8.0.45, for Win64 (x86_64)
--
-- Host: localhost    Database: smnh_hms
-- ------------------------------------------------------
-- Server version	9.6.0

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
SET @MYSQLDUMP_TEMP_LOG_BIN = @@SESSION.SQL_LOG_BIN;
SET @@SESSION.SQL_LOG_BIN= 0;

--
-- GTID state at the beginning of the backup 
--

SET @@GLOBAL.GTID_PURGED=/*!80000 '+'*/ 'e35ee8b3-0809-11f1-82f6-4cc5d9a6b5f2:1-210';

--
-- Table structure for table `branches`
--

DROP TABLE IF EXISTS `branches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `branches` (
  `id` int NOT NULL AUTO_INCREMENT,
  `organization_id` int NOT NULL,
  `name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `address` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `mobile_phone` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_branch_org_code` (`organization_id`,`code`),
  CONSTRAINT `fk_branch_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `branches`
--

LOCK TABLES `branches` WRITE;
/*!40000 ALTER TABLE `branches` DISABLE KEYS */;
INSERT INTO `branches` VALUES (1,1,'Sri Mruthyunjaya Nursing Home','SMNH-PJE','Modi Compund Road, PJ Extension, Davanagere - 577004',1,'2026-02-08 02:23:48','8892705071');
/*!40000 ALTER TABLE `branches` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `consultation_charge_adjustments`
--

DROP TABLE IF EXISTS `consultation_charge_adjustments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `consultation_charge_adjustments` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `visit_id` bigint NOT NULL,
  `service_id` bigint NOT NULL,
  `old_gross_amount` decimal(10,2) NOT NULL,
  `old_discount_amount` decimal(10,2) NOT NULL,
  `old_net_amount` decimal(10,2) NOT NULL,
  `new_discount_amount` decimal(10,2) NOT NULL,
  `new_net_amount` decimal(10,2) NOT NULL,
  `refund_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `refund_payment_id` bigint DEFAULT NULL,
  `reason` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `authorized_by_doctor_id` bigint DEFAULT NULL,
  `created_by` bigint DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cc_adj_visit` (`visit_id`),
  KEY `idx_cc_adj_refund_payment` (`refund_payment_id`),
  CONSTRAINT `fk_cc_adj_refund_payment` FOREIGN KEY (`refund_payment_id`) REFERENCES `payments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_cc_adj_visit` FOREIGN KEY (`visit_id`) REFERENCES `visits` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `consultation_charge_adjustments`
--

LOCK TABLES `consultation_charge_adjustments` WRITE;
/*!40000 ALTER TABLE `consultation_charge_adjustments` DISABLE KEYS */;
INSERT INTO `consultation_charge_adjustments` VALUES (1,2,1,200.00,0.00,200.00,100.00,100.00,0.00,NULL,'Comes from a poor background',4,6,'2026-02-13 13:46:57');
/*!40000 ALTER TABLE `consultation_charge_adjustments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `doctor_branch_assignments`
--

DROP TABLE IF EXISTS `doctor_branch_assignments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `doctor_branch_assignments` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `organization_id` int NOT NULL,
  `doctor_id` bigint NOT NULL,
  `branch_id` int NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `starts_on` date DEFAULT NULL,
  `ends_on` date DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_doc_branch` (`doctor_id`,`branch_id`),
  KEY `idx_doc_branch_branch` (`branch_id`),
  KEY `idx_doc_branch_org` (`organization_id`),
  CONSTRAINT `fk_doc_branch_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`),
  CONSTRAINT `fk_doc_branch_doctor` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`id`),
  CONSTRAINT `fk_doc_branch_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `doctor_branch_assignments`
--

LOCK TABLES `doctor_branch_assignments` WRITE;
/*!40000 ALTER TABLE `doctor_branch_assignments` DISABLE KEYS */;
INSERT INTO `doctor_branch_assignments` VALUES (1,1,4,1,1,NULL,NULL,'2026-02-09 13:17:09'),(2,1,5,1,1,NULL,NULL,'2026-02-09 13:17:09');
/*!40000 ALTER TABLE `doctor_branch_assignments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `doctor_users`
--

DROP TABLE IF EXISTS `doctor_users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `doctor_users` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `organization_id` int NOT NULL,
  `doctor_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_doctor_users_doc_user` (`doctor_id`,`user_id`),
  KEY `idx_doctor_users_doc` (`doctor_id`),
  KEY `idx_doctor_users_org` (`organization_id`),
  KEY `idx_doctor_users_user` (`user_id`),
  CONSTRAINT `fk_doctor_users_doctor` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`id`),
  CONSTRAINT `fk_doctor_users_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`),
  CONSTRAINT `fk_doctor_users_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `doctor_users`
--

LOCK TABLES `doctor_users` WRITE;
/*!40000 ALTER TABLE `doctor_users` DISABLE KEYS */;
INSERT INTO `doctor_users` VALUES (1,1,4,6,1,'2026-02-09 13:31:39');
/*!40000 ALTER TABLE `doctor_users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `doctors`
--

DROP TABLE IF EXISTS `doctors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `doctors` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `organization_id` int NOT NULL,
  `branch_id` int NOT NULL,
  `full_name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_id` bigint DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `specialization` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `qualification` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_doctors_branch_name` (`branch_id`,`full_name`),
  KEY `idx_doctors_org_branch` (`organization_id`,`branch_id`),
  KEY `idx_doctors_name` (`full_name`),
  KEY `fk_doctors_user` (`user_id`),
  CONSTRAINT `fk_doctors_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`),
  CONSTRAINT `fk_doctors_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`),
  CONSTRAINT `fk_doctors_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `doctors`
--

LOCK TABLES `doctors` WRITE;
/*!40000 ALTER TABLE `doctors` DISABLE KEYS */;
INSERT INTO `doctors` VALUES (4,1,1,'A.H.Shivabasavaswamy','9986209702',6,1,'2026-02-08 04:11:48','Consultant Gynecologist','MD (Gyn) DM (Gyn) AAIMS'),(5,1,1,'Sneha Swamy','9986209702',NULL,1,'2026-02-08 04:12:36',NULL,NULL),(6,1,1,'Neha Srinidhi','8909878899',NULL,1,'2026-02-10 01:17:47',NULL,NULL);
/*!40000 ALTER TABLE `doctors` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fee_adjustments`
--

DROP TABLE IF EXISTS `fee_adjustments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fee_adjustments` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `visit_id` bigint NOT NULL,
  `service_id` bigint NOT NULL,
  `old_gross_amount` decimal(10,2) NOT NULL,
  `old_discount_amount` decimal(10,2) NOT NULL,
  `old_net_amount` decimal(10,2) NOT NULL,
  `new_gross_amount` decimal(10,2) NOT NULL,
  `new_discount_amount` decimal(10,2) NOT NULL,
  `new_net_amount` decimal(10,2) NOT NULL,
  `reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `refund_due` decimal(10,2) NOT NULL DEFAULT '0.00',
  `refund_payment_id` bigint DEFAULT NULL,
  `created_by` bigint DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_fee_adj_visit` (`visit_id`),
  KEY `idx_fee_adj_payment` (`refund_payment_id`),
  KEY `fk_fee_adj_service` (`service_id`),
  CONSTRAINT `fk_fee_adj_refund_payment` FOREIGN KEY (`refund_payment_id`) REFERENCES `payments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fee_adj_service` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_fee_adj_visit` FOREIGN KEY (`visit_id`) REFERENCES `visits` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fee_adjustments`
--

LOCK TABLES `fee_adjustments` WRITE;
/*!40000 ALTER TABLE `fee_adjustments` DISABLE KEYS */;
/*!40000 ALTER TABLE `fee_adjustments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `medicines`
--

DROP TABLE IF EXISTS `medicines`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `medicines` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `description` varchar(250) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_medicines_name` (`name`),
  KEY `idx_medicines_active` (`is_active`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `medicines`
--

LOCK TABLES `medicines` WRITE;
/*!40000 ALTER TABLE `medicines` DISABLE KEYS */;
INSERT INTO `medicines` VALUES (1,'ACETREYA SP',1,'2026-02-11 02:03:36','Aceclofenac (100mg) + Paracetemol (325 mg) + Serratiopeptidas (15 mg) Tablet'),(2,'PROTREYA 200 mg',1,'2026-02-11 02:03:36','Progresterone sustained release 200 mg Tablets'),(3,'PROTREYA 300 mg',1,'2026-02-11 02:03:36','Progresterone sustained release 300 mg Tablets'),(4,'MYFOLITE',1,'2026-02-11 02:03:36','Methylfolate 1mg Methylcobalamin 1500 mcg Pyridoxal-5 Phosphate 0.5 mg'),(5,'DOXITREYA',1,'2026-02-11 02:03:36','Doxylamine Succinate 20mg, Pyridoxine 20mg'),(6,'MSP PRO',1,'2026-02-11 02:03:36','Protein Powder 200mg (vanilla & choc)'),(7,'SUNICAL (10x15)',1,'2026-02-11 02:03:36','Calcium Citrate USP 1000mg + Vitamin D3 200IU + Magnesium 100mg + Zinc 4mg'),(8,'NM-CLAV 625',1,'2026-02-11 02:03:36','Amoxycillin 500mg + Clavulanate Acid 125mg');
/*!40000 ALTER TABLE `medicines` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notification_actions`
--

DROP TABLE IF EXISTS `notification_actions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_actions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `notification_id` bigint NOT NULL,
  `actor_user_id` bigint NOT NULL,
  `action_type` enum('READ','ACTED','DISMISSED','SNOOZED') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notification` (`notification_id`),
  KEY `idx_actor_time` (`actor_user_id`,`created_at`),
  CONSTRAINT `notification_actions_ibfk_1` FOREIGN KEY (`notification_id`) REFERENCES `notifications` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notification_actions`
--

LOCK TABLES `notification_actions` WRITE;
/*!40000 ALTER TABLE `notification_actions` DISABLE KEYS */;
/*!40000 ALTER TABLE `notification_actions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notification_events`
--

DROP TABLE IF EXISTS `notification_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_events` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `organization_id` bigint NOT NULL,
  `branch_id` bigint NOT NULL,
  `event_type` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `severity` enum('info','task','critical') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `priority` enum('low','normal','high','critical') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'normal',
  `title` varchar(160) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `body` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `actor_user_id` bigint DEFAULT NULL,
  `entity_type` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entity_id` bigint DEFAULT NULL,
  `payload_json` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_org_branch_time` (`organization_id`,`branch_id`,`created_at`),
  KEY `idx_event_type` (`event_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notification_events`
--

LOCK TABLES `notification_events` WRITE;
/*!40000 ALTER TABLE `notification_events` DISABLE KEYS */;
/*!40000 ALTER TABLE `notification_events` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `organization_id` bigint NOT NULL,
  `branch_id` bigint NOT NULL,
  `event_id` bigint DEFAULT NULL,
  `recipient_user_id` bigint NOT NULL,
  `status` enum('unread','read','acted') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unread',
  `read_at` timestamp NULL DEFAULT NULL,
  `acted_at` timestamp NULL DEFAULT NULL,
  `title` varchar(160) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `body` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `severity` enum('info','task','critical') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `priority` enum('low','normal','high','critical') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'normal',
  `entity_type` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entity_id` bigint DEFAULT NULL,
  `route` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `action_label` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `action_kind` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `event_id` (`event_id`),
  KEY `idx_recipient_status_time` (`recipient_user_id`,`status`,`created_at`),
  KEY `idx_org_branch_time` (`organization_id`,`branch_id`,`created_at`),
  CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`event_id`) REFERENCES `notification_events` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `organizations`
--

DROP TABLE IF EXISTS `organizations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `organizations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `address` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(25) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `organizations`
--

LOCK TABLES `organizations` WRITE;
/*!40000 ALTER TABLE `organizations` DISABLE KEYS */;
INSERT INTO `organizations` VALUES (1,'Sri Mruthyunjaya Nursing Home','SMNH',1,'2026-02-08 02:23:41',NULL,NULL);
/*!40000 ALTER TABLE `organizations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `patient_counters`
--

DROP TABLE IF EXISTS `patient_counters`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `patient_counters` (
  `organization_id` int NOT NULL,
  `branch_id` int NOT NULL,
  `next_seq` int NOT NULL,
  PRIMARY KEY (`organization_id`,`branch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `patient_counters`
--

LOCK TABLES `patient_counters` WRITE;
/*!40000 ALTER TABLE `patient_counters` DISABLE KEYS */;
INSERT INTO `patient_counters` VALUES (1,1,2);
/*!40000 ALTER TABLE `patient_counters` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `patients`
--

DROP TABLE IF EXISTS `patients`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `patients` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `organization_id` int NOT NULL,
  `branch_id` int NOT NULL,
  `patient_code` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `full_name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dob` date DEFAULT NULL,
  `gender` enum('MALE','FEMALE','OTHER') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `blood_group` enum('A+','A-','B+','B-','AB+','AB-','O+','O-') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address_line1` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address_line2` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `city` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `state` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pincode` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `emergency_contact_name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `emergency_contact_relationship` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `emergency_contact_phone` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_patients_org_branch_code` (`organization_id`,`branch_id`,`patient_code`),
  KEY `idx_patients_phone` (`phone`),
  KEY `idx_patients_name` (`full_name`),
  KEY `idx_patients_org_branch` (`organization_id`,`branch_id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `patients`
--

LOCK TABLES `patients` WRITE;
/*!40000 ALTER TABLE `patients` DISABLE KEYS */;
INSERT INTO `patients` VALUES (1,1,1,'OP_SMNH-PJE_2026021','Test Patient 1','9986209702',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-02-12 13:18:21');
/*!40000 ALTER TABLE `patients` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payment_allocations`
--

DROP TABLE IF EXISTS `payment_allocations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payment_allocations` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `payment_id` bigint NOT NULL,
  `visit_id` bigint NOT NULL,
  `service_id` bigint NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_alloc_payment` (`payment_id`),
  KEY `idx_alloc_visit` (`visit_id`),
  KEY `idx_alloc_visit_service` (`visit_id`,`service_id`),
  KEY `fk_alloc_service` (`service_id`),
  CONSTRAINT `fk_alloc_payment` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_alloc_service` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_alloc_visit` FOREIGN KEY (`visit_id`) REFERENCES `visits` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payment_allocations`
--

LOCK TABLES `payment_allocations` WRITE;
/*!40000 ALTER TABLE `payment_allocations` DISABLE KEYS */;
INSERT INTO `payment_allocations` VALUES (1,1,1,1,200.00,'2026-02-12 18:48:21'),(2,2,2,1,200.00,'2026-02-13 10:22:37');
/*!40000 ALTER TABLE `payment_allocations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payment_documents`
--

DROP TABLE IF EXISTS `payment_documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payment_documents` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `payment_id` bigint NOT NULL,
  `file_url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_path` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `original_name` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `uploaded_by` bigint DEFAULT NULL,
  `uploaded_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_payment_documents_payment` (`payment_id`),
  CONSTRAINT `fk_payment_documents_payment` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payment_documents`
--

LOCK TABLES `payment_documents` WRITE;
/*!40000 ALTER TABLE `payment_documents` DISABLE KEYS */;
/*!40000 ALTER TABLE `payment_documents` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payment_modes`
--

DROP TABLE IF EXISTS `payment_modes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payment_modes` (
  `code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `display_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '100',
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payment_modes`
--

LOCK TABLES `payment_modes` WRITE;
/*!40000 ALTER TABLE `payment_modes` DISABLE KEYS */;
INSERT INTO `payment_modes` VALUES ('AmazonPay','Amazon Pay',1,60),('CARD','Card',1,30),('CASH','Cash',1,10),('GooglePay','Google Pay',1,40),('INSURANCE','Insurance',1,70),('PhonePe','PhonePe',1,50),('UPI','UPI',1,20);
/*!40000 ALTER TABLE `payment_modes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payments`
--

DROP TABLE IF EXISTS `payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payments` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `visit_id` bigint NOT NULL,
  `service_id` bigint NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `payment_mode_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `pay_status` enum('ACCEPTED','PENDING','WAIVED') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACCEPTED',
  `direction` enum('PAYMENT','REFUND') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PAYMENT',
  `reference_no` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `note` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` bigint DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `paid_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_payments_visit_created` (`visit_id`,`created_at`),
  KEY `idx_payments_service_created` (`service_id`,`created_at`),
  KEY `idx_payments_mode_created` (`payment_mode_code`,`created_at`),
  KEY `idx_payments_direction_created` (`direction`,`created_at`),
  CONSTRAINT `fk_payments_mode` FOREIGN KEY (`payment_mode_code`) REFERENCES `payment_modes` (`code`) ON DELETE RESTRICT,
  CONSTRAINT `fk_payments_service` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_payments_visit` FOREIGN KEY (`visit_id`) REFERENCES `visits` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_payments_amount_pos` CHECK ((`amount` > 0))
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payments`
--

LOCK TABLES `payments` WRITE;
/*!40000 ALTER TABLE `payments` DISABLE KEYS */;
INSERT INTO `payments` VALUES (1,1,1,200.00,'CASH','ACCEPTED','PAYMENT',NULL,NULL,5,'2026-02-12 13:18:21',NULL),(2,2,1,200.00,'CASH','ACCEPTED','PAYMENT',NULL,'Follow up visit',5,'2026-02-13 04:52:37',NULL);
/*!40000 ALTER TABLE `payments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pharma_orders`
--

DROP TABLE IF EXISTS `pharma_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pharma_orders` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `visit_id` bigint NOT NULL,
  `prescription_id` bigint NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'PENDING',
  `updated_by` bigint DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pharma_orders_visit` (`visit_id`),
  KEY `idx_pharma_orders_status` (`status`),
  KEY `idx_pharma_orders_prescription` (`prescription_id`),
  CONSTRAINT `fk_pharma_orders_prescription` FOREIGN KEY (`prescription_id`) REFERENCES `prescriptions` (`id`),
  CONSTRAINT `fk_pharma_orders_visit` FOREIGN KEY (`visit_id`) REFERENCES `visits` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pharma_orders`
--

LOCK TABLES `pharma_orders` WRITE;
/*!40000 ALTER TABLE `pharma_orders` DISABLE KEYS */;
INSERT INTO `pharma_orders` VALUES (1,1,1,'PENDING',6,'2026-02-12 13:19:52','2026-02-12 13:19:52'),(2,2,2,'PENDING',6,'2026-02-13 08:16:57','2026-02-13 08:16:57');
/*!40000 ALTER TABLE `pharma_orders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `prescription_items`
--

DROP TABLE IF EXISTS `prescription_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `prescription_items` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `prescription_id` bigint NOT NULL,
  `medicine_name` varchar(255) NOT NULL,
  `dosage` varchar(100) DEFAULT NULL,
  `morning` tinyint(1) NOT NULL DEFAULT '0',
  `afternoon` tinyint(1) NOT NULL DEFAULT '0',
  `night` tinyint(1) NOT NULL DEFAULT '0',
  `before_food` tinyint(1) NOT NULL DEFAULT '0',
  `duration_days` int DEFAULT NULL,
  `instructions` varchar(255) DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_items_prescription` (`prescription_id`),
  CONSTRAINT `fk_items_prescription` FOREIGN KEY (`prescription_id`) REFERENCES `prescriptions` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `prescription_items`
--

LOCK TABLES `prescription_items` WRITE;
/*!40000 ALTER TABLE `prescription_items` DISABLE KEYS */;
INSERT INTO `prescription_items` VALUES (1,1,'ACETREYA SP','0-0-1',0,0,1,0,10,'[P=Daily][S=2026-02-12]',0),(2,2,'ACETREYA SP','1-1-1',1,1,1,0,10,'[P=Daily][S=2026-02-13]',0),(3,2,'SUNICAL (10x15)','0-0-1',0,0,1,0,30,'[P=Daily][S=2026-02-13]',1);
/*!40000 ALTER TABLE `prescription_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `prescriptions`
--

DROP TABLE IF EXISTS `prescriptions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `prescriptions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `visit_id` bigint NOT NULL,
  `notes` text,
  `created_by` bigint NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_prescription_visit` (`visit_id`),
  KEY `idx_prescriptions_visit` (`visit_id`),
  CONSTRAINT `fk_prescriptions_visit` FOREIGN KEY (`visit_id`) REFERENCES `visits` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `prescriptions`
--

LOCK TABLES `prescriptions` WRITE;
/*!40000 ALTER TABLE `prescriptions` DISABLE KEYS */;
INSERT INTO `prescriptions` VALUES (1,1,'Notes',6,'2026-02-12 13:19:52'),(2,2,'Prescription Notes data to be entered here\nPharmacy discount note: Provide 10% discount',6,'2026-02-13 08:16:57');
/*!40000 ALTER TABLE `prescriptions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `queue_entries`
--

DROP TABLE IF EXISTS `queue_entries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `queue_entries` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `visit_id` bigint NOT NULL,
  `token_no` int NOT NULL,
  `status` enum('WAITING','NEXT','IN_ROOM','COMPLETED') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_queue_status` (`status`),
  KEY `idx_queue_token` (`token_no`),
  KEY `idx_queue_visit_status` (`visit_id`,`status`),
  KEY `idx_queue_visit_token` (`visit_id`,`token_no`),
  KEY `idx_queue_created` (`created_at`),
  CONSTRAINT `fk_queue_visit` FOREIGN KEY (`visit_id`) REFERENCES `visits` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `queue_entries`
--

LOCK TABLES `queue_entries` WRITE;
/*!40000 ALTER TABLE `queue_entries` DISABLE KEYS */;
INSERT INTO `queue_entries` VALUES (1,1,1,'COMPLETED','2026-02-12 13:18:21'),(2,2,1,'COMPLETED','2026-02-13 04:52:37');
/*!40000 ALTER TABLE `queue_entries` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `referralperson`
--

DROP TABLE IF EXISTS `referralperson`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `referralperson` (
  `id` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ReferralPerson_name_key` (`name`),
  KEY `idx_referralperson_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `referralperson`
--

LOCK TABLES `referralperson` WRITE;
/*!40000 ALTER TABLE `referralperson` DISABLE KEYS */;
INSERT INTO `referralperson` VALUES ('2a463864-422a-46ab-8530-c7a21836704c','Nazeema','2026-02-08 13:25:20.092'),('354b70e6-2b57-449c-a1d3-c628b227a730','Shahista','2026-02-08 13:27:14.099'),('79267450-f328-4492-9f55-a072b757ddac','Dr. Uma','2026-02-08 12:06:09.686'),('c6e0ee70-60ab-4648-a62e-9655764f582b','MM','2026-02-08 09:41:23.788');
/*!40000 ALTER TABLE `referralperson` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `refund_documents`
--

DROP TABLE IF EXISTS `refund_documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `refund_documents` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `refund_id` bigint NOT NULL,
  `file_url` varchar(500) NOT NULL,
  `file_path` varchar(500) NOT NULL,
  `original_name` varchar(255) DEFAULT NULL,
  `mime_type` varchar(100) DEFAULT NULL,
  `size_bytes` bigint DEFAULT NULL,
  `uploaded_by` bigint DEFAULT NULL,
  `uploaded_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_refund_doc` (`refund_id`),
  CONSTRAINT `fk_refdoc_ref` FOREIGN KEY (`refund_id`) REFERENCES `refunds` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `refund_documents`
--

LOCK TABLES `refund_documents` WRITE;
/*!40000 ALTER TABLE `refund_documents` DISABLE KEYS */;
/*!40000 ALTER TABLE `refund_documents` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `refunds`
--

DROP TABLE IF EXISTS `refunds`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `refunds` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `adjustment_id` bigint NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `payment_mode_code` varchar(50) NOT NULL,
  `reference_no` varchar(100) DEFAULT NULL,
  `note` varchar(255) DEFAULT NULL,
  `created_by` bigint DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ref_adj` (`adjustment_id`),
  CONSTRAINT `fk_ref_adj` FOREIGN KEY (`adjustment_id`) REFERENCES `visit_charge_adjustments` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `refunds`
--

LOCK TABLES `refunds` WRITE;
/*!40000 ALTER TABLE `refunds` DISABLE KEYS */;
/*!40000 ALTER TABLE `refunds` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `roles`
--

DROP TABLE IF EXISTS `roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `roles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `roles`
--

LOCK TABLES `roles` WRITE;
/*!40000 ALTER TABLE `roles` DISABLE KEYS */;
INSERT INTO `roles` VALUES (10,'ADMIN'),(14,'CTG_IN_CHARGE'),(12,'DOCTOR'),(15,'LAB_IN_CHARGE'),(13,'PAP_SMEAR_IN_CHARGE'),(16,'PHARMA_IN_CHARGE'),(11,'RECEPTION');
/*!40000 ALTER TABLE `roles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `service_rates`
--

DROP TABLE IF EXISTS `service_rates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `service_rates` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `service_id` bigint NOT NULL,
  `branch_id` int NOT NULL,
  `rate` decimal(10,2) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_service_rates_service_branch` (`service_id`,`branch_id`),
  KEY `idx_service_rates_branch` (`branch_id`),
  CONSTRAINT `fk_service_rates_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_service_rates_service` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `service_rates`
--

LOCK TABLES `service_rates` WRITE;
/*!40000 ALTER TABLE `service_rates` DISABLE KEYS */;
INSERT INTO `service_rates` VALUES (1,1,1,200.00,1,'2026-02-08 02:24:10','2026-02-08 10:20:19'),(2,4,1,1000.00,1,'2026-02-08 02:24:10',NULL),(3,3,1,800.00,1,'2026-02-08 02:24:10',NULL),(4,5,1,0.00,1,'2026-02-08 02:24:10',NULL),(5,2,1,1200.00,1,'2026-02-08 02:24:10',NULL);
/*!40000 ALTER TABLE `service_rates` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `services`
--

DROP TABLE IF EXISTS `services`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `services` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `organization_id` int NOT NULL,
  `code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `display_name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_services_org_code` (`organization_id`,`code`),
  KEY `idx_services_org_active` (`organization_id`,`is_active`),
  CONSTRAINT `fk_services_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `services`
--

LOCK TABLES `services` WRITE;
/*!40000 ALTER TABLE `services` DISABLE KEYS */;
INSERT INTO `services` VALUES (1,1,'CONSULTATION','Consultation','OPD',1,'2026-02-08 02:24:03',NULL),(2,1,'SCAN','Scan','IMAGING',1,'2026-02-08 02:24:03',NULL),(3,1,'PAP','PAP Smear','LAB',1,'2026-02-08 02:24:03',NULL),(4,1,'CTG','CTG Analysis','LAB',1,'2026-02-08 02:24:03',NULL),(5,1,'PHARMA','Pharmacy (Total Bill Entry)','PHARMACY',1,'2026-02-08 02:24:03',NULL),(6,1,'LAB','Lab Tests','LAB',1,'2026-02-09 15:05:20',NULL);
/*!40000 ALTER TABLE `services` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sessions`
--

DROP TABLE IF EXISTS `sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sessions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `session_token` char(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` timestamp NOT NULL,
  `revoked_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `session_token` (`session_token`),
  KEY `idx_sessions_user` (`user_id`),
  KEY `idx_sessions_expires` (`expires_at`),
  CONSTRAINT `fk_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=108 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sessions`
--

LOCK TABLES `sessions` WRITE;
/*!40000 ALTER TABLE `sessions` DISABLE KEYS */;
INSERT INTO `sessions` VALUES (60,5,'0dc757e7de0ea1464b6c144efd7bf74e24b7748a60107132ea2ea8fc8040df1a','2026-02-08 02:37:34','2026-02-15 02:37:34','2026-02-08 11:42:54'),(61,5,'6c0aa191e31d6cafcf0345d7a948b71dc4d95f45fd526de71fbdca53d005dcaa','2026-02-08 12:20:00','2026-02-15 12:20:01','2026-02-08 16:42:54'),(62,5,'b5a149f6488fe4ed298bfc2e25738dccfeae3f200efe42372a7bddd4c25cad3c','2026-02-08 23:06:10','2026-02-15 23:06:10','2026-02-09 01:24:24'),(63,5,'5ba71ca2f92895ca58c2d01686233dbd0a2a908882583d5c829ad7d7b1ad5658','2026-02-09 01:48:24','2026-02-16 01:48:25','2026-02-09 06:48:49'),(64,6,'1aa3e9cc398791dcd38c3abbd478738152a52c1ffdb3121ebb0b5f20a1b57e7d','2026-02-09 06:49:29','2026-02-16 06:49:30','2026-02-09 06:50:06'),(65,5,'d7f810490fa3396dce42ace9c006e44d4de5a007f3fcacc123dc02c37153db64','2026-02-09 06:50:24','2026-02-16 06:50:25','2026-02-09 09:25:22'),(66,5,'e0eea2ba4e2efc27a8e5c4efa76bfdc7f87494d29072e8bb0ff307ebce40c9ea','2026-02-09 09:26:11','2026-02-16 09:26:11','2026-02-09 09:26:53'),(67,5,'2ca8cd58b40316f54d06c1f192c0696b5c9c59bc20f4711154211a74b9bb89e6','2026-02-09 09:59:09','2026-02-16 09:59:10','2026-02-09 10:18:26'),(68,6,'9e81313d7eda7d7cabeca5f9550d5cb3d91a3543bc556b36a4cddd2f6dfd9d72','2026-02-09 10:18:41','2026-02-16 10:18:42','2026-02-09 13:54:55'),(69,6,'123221ec3c23ea913db06123fa34dd19013a9bb9dd559f676e3c8f7d5c470364','2026-02-09 14:15:52','2026-02-16 14:15:53','2026-02-09 15:35:47'),(70,6,'fc2ed16095590d021bd42c42bcfca1b565b681916e36cf00736b4f045a827340','2026-02-09 16:21:57','2026-02-16 16:21:57','2026-02-09 17:07:35'),(71,5,'b0f6c7ebf3bf4fdb5c9daa17bdd01beb1a53e812bd000f60de4ab25e191393b2','2026-02-09 23:47:18','2026-02-16 23:47:18','2026-02-10 00:09:46'),(72,6,'7b0df00ae3e730394704fccba3f7140fab693c186726dad36d3548062e0d44fb','2026-02-10 00:09:59','2026-02-17 00:10:00','2026-02-10 00:15:13'),(73,5,'39365ef7839674f0150f79ea65542fa9c4066a148523d138aac21b8eca5a4b02','2026-02-10 00:15:31','2026-02-17 00:15:31','2026-02-10 03:40:03'),(74,5,'ba55fb5641d059970a8bd51f2deadbc2d0e5aeed2bf41835181578986b61cbd7','2026-02-10 04:39:52','2026-02-17 04:39:52','2026-02-10 05:21:57'),(75,5,'956e4e055843e22f877e394c9229664630e95ebbfb6715de383f52e5c2342bc7','2026-02-10 05:40:20','2026-02-17 05:40:20','2026-02-10 06:20:04'),(76,5,'8ff202ef995b83162e69417a4ad638b789f34d9b25fc7a31f8b485ce3f913e8b','2026-02-10 06:22:06','2026-02-17 06:22:07','2026-02-10 07:33:21'),(77,6,'fde8d0ca3a91d0ee46fbbd11fbc77cb9255fcfa880f461afa384e3d1addc6259','2026-02-10 07:33:34','2026-02-17 07:33:34','2026-02-10 08:11:54'),(78,6,'05ed87d4973f87c5763a28a60d655eb30203325da793e4bbf40280a89fa59e86','2026-02-10 08:12:35','2026-02-17 08:12:36',NULL),(79,6,'60dead9b22a5f9b9993491b3156fa320b846e930cb02d98eb7af30296e2565a0','2026-02-10 13:15:36','2026-02-17 13:15:36','2026-02-10 16:25:49'),(80,5,'850f5c94e2b438077c302d44b7743add9afd07b0ede35fe9b4f6847e7a8534dd','2026-02-11 00:49:34','2026-02-18 00:49:35','2026-02-11 00:50:25'),(81,6,'fccffbad1f85f70c0b7e469d080e24604c912227bb2b35e7f71e8c0a6958a4be','2026-02-11 00:50:40','2026-02-18 00:50:41','2026-02-11 06:41:44'),(82,5,'3f852fa3838d65a381798a881fff388b230c6f080a07b57acd84754ff935620c','2026-02-11 07:15:06','2026-02-18 07:15:06','2026-02-11 07:16:55'),(83,6,'21bc5a2a3783fc0156744333eb5fafd5e14603c74fdb259df733c4fc31c5f295','2026-02-11 07:17:13','2026-02-18 07:17:13','2026-02-11 07:18:51'),(84,6,'5b681d848c85ba8349616a6f23228a3858576ad4b9c54f7840ec3927a1b961f7','2026-02-11 07:29:49','2026-02-18 07:29:49','2026-02-11 12:13:26'),(85,5,'60eeecf436e75c71f57238197f4434438347f88d82b1f7879cd209926341d0f5','2026-02-11 12:47:14','2026-02-18 12:47:14','2026-02-11 13:47:06'),(86,6,'68c087de4edea643e34e058ef53f295ac11bfeab4be050a99eb242a6c91542b0','2026-02-11 13:47:18','2026-02-18 13:47:18','2026-02-11 13:47:54'),(87,5,'64e49b1e1ff5dfe8b095e16bb6cec36c3cb2aa87a6a506148ec18c9762060eb4','2026-02-11 13:51:13','2026-02-18 13:51:13','2026-02-11 13:51:49'),(88,6,'6dec66687377d4e401b20721295aa2e5b04351e86ee8d0dd7be9cc605ad9f7d2','2026-02-11 13:52:03','2026-02-18 13:52:04','2026-02-11 13:54:45'),(89,6,'2a6d142df4697d2d03788ba6333f2671ed74f9803b260711a95262854b3e4c44','2026-02-11 14:36:46','2026-02-18 14:36:47','2026-02-11 18:01:44'),(90,5,'c3a5741fb7e34eebc1633d65a5f06868d81bf87a8f93c3c5968961691ce60a75','2026-02-11 23:57:20','2026-02-18 23:57:20','2026-02-11 23:58:00'),(91,6,'7b23cac92d700360e78953e93dc799cfec90cd52c13300f6ddb05be09d276255','2026-02-11 23:58:13','2026-02-18 23:58:13','2026-02-12 00:06:03'),(92,5,'e6708a1eb29ef8d217f8ab39417c62857ba049baf5a860994b8f0040791c2126','2026-02-12 00:24:43','2026-02-19 00:24:44','2026-02-12 00:25:15'),(93,6,'0ae86fe1d61cfb975e43b0823a45a1681c88b8be29f79e7d009ec1d567732937','2026-02-12 00:25:27','2026-02-19 00:25:27','2026-02-12 00:27:16'),(94,5,'012d710d323a696a7af776bd8131a48df0437917963eefdbfec1ccd338f900e5','2026-02-12 01:00:42','2026-02-19 01:00:42','2026-02-12 01:55:34'),(95,5,'cef898a51520f12538144fca9884b381f82e74ad9cd7a37124c2f7b30a6fe0a8','2026-02-12 01:55:53','2026-02-19 01:55:53','2026-02-12 01:56:53'),(96,6,'22ada68b8611159fecb7ffbcbfd64ce5c88ed25e3a75a69775b3d90b749b0dc5','2026-02-12 01:57:06','2026-02-19 01:57:06','2026-02-12 03:03:27'),(97,5,'f0fce7e78384dec6a974742cc0070f3e7cf37e61996b8640998c102e98e24c22','2026-02-12 03:03:57','2026-02-19 03:03:57','2026-02-12 04:48:31'),(98,6,'6f4abeab4be65ca93e032ffd75b9817a9e4a378396345c2555bed88a6f6fc263','2026-02-12 03:04:17','2026-02-19 03:04:18','2026-02-12 04:48:24'),(99,5,'6452c44d2ffc052fc14e7b0f034cb800625d78541a7a962bc3ff5672a54f814e','2026-02-12 12:26:20','2026-02-19 12:26:20','2026-02-12 12:26:47'),(100,5,'1d7813d6df1859235c8014bcbd7a07f369721fa69ca92f0a1c612330b44acf07','2026-02-12 12:47:03','2026-02-19 12:47:03','2026-02-12 15:47:55'),(101,6,'8e349e699521a4f44be1cf8a3410b09b5b31cce7b129d51350b299db1ea8d999','2026-02-12 13:12:46','2026-02-19 13:12:47',NULL),(102,5,'42002789f13a64eb198960ea1dd60ab4431b28da9872b79e7b3901dd8026357b','2026-02-13 00:05:49','2026-02-20 00:05:50','2026-02-13 03:56:01'),(103,5,'26011429c793b16759d51f815c6da6177c19f7f9ee1b99218247f84ae2638b5b','2026-02-13 03:57:56','2026-02-20 03:57:56','2026-02-13 04:48:09'),(104,6,'ec1aeddb6815eea03fa72757e69423f8f3497d8d5371cb9d654b15cc671d49ef','2026-02-13 04:48:24','2026-02-20 04:48:24','2026-02-13 04:51:43'),(105,5,'fb5761de996aa31966a539cb3e2fa3bebdfe6ea5877c746cb340cc7721b95b25','2026-02-13 04:52:07','2026-02-20 04:52:08','2026-02-13 05:44:56'),(106,6,'04beac4fea6e8416af3913f3520a7a6bd7cdac16d7ee01f619e225f81507d62d','2026-02-13 05:45:09','2026-02-20 05:45:09','2026-02-13 08:10:28'),(107,6,'67803b327fbd916c3bfb2f90486487abc5692467dff1bcbdf590299ff39dba0a','2026-02-13 08:11:37','2026-02-20 08:11:37',NULL);
/*!40000 ALTER TABLE `sessions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_roles`
--

DROP TABLE IF EXISTS `user_roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_roles` (
  `user_id` bigint NOT NULL,
  `role_id` int NOT NULL,
  PRIMARY KEY (`user_id`,`role_id`),
  KEY `fk_ur_role` (`role_id`),
  CONSTRAINT `fk_ur_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_ur_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_roles`
--

LOCK TABLES `user_roles` WRITE;
/*!40000 ALTER TABLE `user_roles` DISABLE KEYS */;
INSERT INTO `user_roles` VALUES (4,10),(5,11),(6,12);
/*!40000 ALTER TABLE `user_roles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `full_name` varchar(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(190) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `password_hash` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `must_change_password` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `organization_id` int DEFAULT NULL,
  `branch_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `fk_users_branch` (`branch_id`),
  KEY `idx_users_org_branch` (`organization_id`,`branch_id`),
  CONSTRAINT `fk_users_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_users_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (4,'SMNH Admin','admin@smnh.local','9999999999','$2b$10$r/IZ9FpYg1Ob.gz8zujw1.9oXGv9yQqDTcdJkbXtF7/mUTa0hEK8a',1,1,'2026-02-08 02:36:44','2026-02-08 02:36:44',1,1),(5,'Reception User','reception@smnh.local','8888888888','$2b$10$xKOBO4aHW0BETtY4IMp.3.MXSglQdY1bFwoJwepUAo3Ds91zyyTn6',1,1,'2026-02-08 02:36:45','2026-02-08 02:36:45',1,1),(6,'Doctor User','doctor@smnh.local','7777777777','$2b$10$hJxKeFcO.bv7sX2W1TIfP.kn7ds0lMB.kSwN/F9CGi5kyLld.GFe6',1,1,'2026-02-08 02:36:45','2026-02-08 02:36:45',1,1);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `visit_charge_adjustments`
--

DROP TABLE IF EXISTS `visit_charge_adjustments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `visit_charge_adjustments` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `visit_id` bigint NOT NULL,
  `service_id` bigint NOT NULL,
  `original_gross_amount` decimal(10,2) NOT NULL,
  `original_discount_amount` decimal(10,2) NOT NULL,
  `original_net_amount` decimal(10,2) NOT NULL,
  `adjusted_net_amount` decimal(10,2) NOT NULL,
  `adjustment_amount` decimal(10,2) NOT NULL,
  `adjustment_type` enum('DISCOUNT','WAIVE') NOT NULL,
  `reason` varchar(255) DEFAULT NULL,
  `status` enum('REQUESTED','APPROVED','REJECTED','CANCELLED') NOT NULL DEFAULT 'REQUESTED',
  `requested_by` bigint DEFAULT NULL,
  `requested_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `approved_by` bigint DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `cancelled_by` bigint DEFAULT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_vca_visit` (`visit_id`),
  KEY `idx_vca_visit_service_status` (`visit_id`,`service_id`,`status`),
  CONSTRAINT `fk_vca_visit` FOREIGN KEY (`visit_id`) REFERENCES `visits` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `visit_charge_adjustments`
--

LOCK TABLES `visit_charge_adjustments` WRITE;
/*!40000 ALTER TABLE `visit_charge_adjustments` DISABLE KEYS */;
/*!40000 ALTER TABLE `visit_charge_adjustments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `visit_charges`
--

DROP TABLE IF EXISTS `visit_charges`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `visit_charges` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `visit_id` bigint NOT NULL,
  `service_id` bigint NOT NULL,
  `gross_amount` decimal(10,2) NOT NULL,
  `discount_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `net_amount` decimal(10,2) NOT NULL,
  `note` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_visit_charges_visit` (`visit_id`),
  KEY `idx_visit_charges_service` (`service_id`),
  KEY `idx_visit_charges_visit_service` (`visit_id`,`service_id`),
  CONSTRAINT `fk_visit_charges_service` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_visit_charges_visit` FOREIGN KEY (`visit_id`) REFERENCES `visits` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_visit_charges_net` CHECK ((`net_amount` = (`gross_amount` - `discount_amount`))),
  CONSTRAINT `chk_visit_charges_nonneg` CHECK (((`gross_amount` >= 0) and (`discount_amount` >= 0) and (`net_amount` >= 0)))
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `visit_charges`
--

LOCK TABLES `visit_charges` WRITE;
/*!40000 ALTER TABLE `visit_charges` DISABLE KEYS */;
INSERT INTO `visit_charges` VALUES (1,1,1,200.00,0.00,200.00,NULL,'2026-02-12 18:48:21',NULL),(2,2,1,200.00,0.00,200.00,NULL,'2026-02-13 10:22:37',NULL);
/*!40000 ALTER TABLE `visit_charges` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `visit_documents`
--

DROP TABLE IF EXISTS `visit_documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `visit_documents` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `visit_id` bigint NOT NULL,
  `payment_id` bigint DEFAULT NULL,
  `category` varchar(50) NOT NULL DEFAULT 'REPORT',
  `file_url` varchar(500) NOT NULL,
  `file_path` varchar(500) NOT NULL,
  `original_name` varchar(255) DEFAULT NULL,
  `mime_type` varchar(100) DEFAULT NULL,
  `size_bytes` bigint DEFAULT NULL,
  `uploaded_by` bigint DEFAULT NULL,
  `uploaded_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `service_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_visit_documents_refund_voucher` (`payment_id`,`category`),
  KEY `idx_visit_documents_visit_id` (`visit_id`),
  KEY `idx_visit_documents_payment_id` (`payment_id`),
  KEY `idx_visit_documents_payment` (`payment_id`),
  CONSTRAINT `fk_visit_documents_payment` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_visit_documents_visit` FOREIGN KEY (`visit_id`) REFERENCES `visits` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `visit_documents`
--

LOCK TABLES `visit_documents` WRITE;
/*!40000 ALTER TABLE `visit_documents` DISABLE KEYS */;
/*!40000 ALTER TABLE `visit_documents` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `visit_notes`
--

DROP TABLE IF EXISTS `visit_notes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `visit_notes` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `visit_id` bigint NOT NULL,
  `diagnosis` text,
  `investigation` text,
  `treatment` text,
  `remarks` text,
  `created_by` bigint NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_visit_notes_visit` (`visit_id`),
  KEY `idx_visit_notes_visit` (`visit_id`),
  CONSTRAINT `fk_visit_notes_visit` FOREIGN KEY (`visit_id`) REFERENCES `visits` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `visit_notes`
--

LOCK TABLES `visit_notes` WRITE;
/*!40000 ALTER TABLE `visit_notes` DISABLE KEYS */;
INSERT INTO `visit_notes` VALUES (1,1,'Diagnosis','Investigation','Treatment','Consultation Remarks',6,'2026-02-12 13:19:52',NULL),(2,2,'Diagnosis data to be entered here','Investigation data to be entered here','Treatment data to be entered here','Consultation Remarks data to be entered here',6,'2026-02-13 08:16:57',NULL);
/*!40000 ALTER TABLE `visit_notes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `visit_orders`
--

DROP TABLE IF EXISTS `visit_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `visit_orders` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `visit_id` bigint NOT NULL,
  `service_id` bigint NOT NULL,
  `status` enum('ORDERED','IN_PROGRESS','COMPLETED','CANCELLED') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ORDERED',
  `notes` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ordered_by_user_id` bigint DEFAULT NULL,
  `ordered_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_visit_orders_visit_service` (`visit_id`,`service_id`),
  KEY `idx_orders_visit` (`visit_id`),
  KEY `idx_orders_type_status` (`status`),
  KEY `idx_visit_orders_service_status` (`service_id`,`status`),
  CONSTRAINT `fk_orders_visit` FOREIGN KEY (`visit_id`) REFERENCES `visits` (`id`),
  CONSTRAINT `fk_visit_orders_service` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `visit_orders`
--

LOCK TABLES `visit_orders` WRITE;
/*!40000 ALTER TABLE `visit_orders` DISABLE KEYS */;
INSERT INTO `visit_orders` VALUES (1,1,2,'ORDERED','SMNH (FM)',6,'2026-02-12 13:19:52','2026-02-12 13:19:52'),(2,1,3,'ORDERED','PAP Smear',6,'2026-02-12 13:19:52','2026-02-12 13:19:52'),(3,1,4,'ORDERED','CTG Report',6,'2026-02-12 13:19:52','2026-02-12 13:19:52'),(4,1,6,'ORDERED','CBC\nTIC',6,'2026-02-12 13:19:52','2026-02-12 13:19:52'),(5,2,2,'ORDERED','Do this scan\nDiscount note: Waive off 10%',6,'2026-02-13 08:16:57','2026-02-13 08:16:57'),(6,2,3,'ORDERED','Do this PAP Smear\nDiscount note: Waive off 5%',6,'2026-02-13 08:16:57','2026-02-13 08:16:57'),(7,2,4,'ORDERED','Do a CTG analysis',6,'2026-02-13 08:16:57','2026-02-13 08:16:57'),(8,2,6,'ORDERED','TIC\nCBC\nDiscount note: Waive off 10%',6,'2026-02-13 08:16:57','2026-02-13 08:16:57');
/*!40000 ALTER TABLE `visit_orders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `visits`
--

DROP TABLE IF EXISTS `visits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `visits` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `patient_id` bigint NOT NULL,
  `organization_id` int NOT NULL,
  `branch_id` int NOT NULL,
  `visit_date` date NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `referralperson_id` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `visit_day` date GENERATED ALWAYS AS (`visit_date`) STORED,
  `doctor_id` bigint DEFAULT NULL,
  `status` enum('OPEN','IN_CONSULTATION','COMPLETED','CANCELLED','NO_SHOW') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  `cancelled_by` bigint DEFAULT NULL,
  `cancel_reason` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `admit_requested` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `fk_visits_branch` (`branch_id`),
  KEY `idx_visits_org_branch_date` (`organization_id`,`branch_id`,`visit_date`),
  KEY `idx_visits_patient` (`patient_id`),
  KEY `idx_visits_doctor_date` (`visit_date`),
  KEY `fk_visits_referral` (`referralperson_id`),
  KEY `idx_visits_status_date` (`status`,`created_at`),
  KEY `idx_visits_org_branch_date_status` (`organization_id`,`branch_id`,`visit_date`,`status`),
  CONSTRAINT `fk_visits_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`),
  CONSTRAINT `fk_visits_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`),
  CONSTRAINT `fk_visits_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`),
  CONSTRAINT `fk_visits_referral` FOREIGN KEY (`referralperson_id`) REFERENCES `referralperson` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `visits`
--

LOCK TABLES `visits` WRITE;
/*!40000 ALTER TABLE `visits` DISABLE KEYS */;
INSERT INTO `visits` (`id`, `patient_id`, `organization_id`, `branch_id`, `visit_date`, `created_at`, `referralperson_id`, `doctor_id`, `status`, `cancelled_at`, `cancelled_by`, `cancel_reason`, `admit_requested`) VALUES (1,1,1,1,'2026-02-12','2026-02-12 13:18:21','c6e0ee70-60ab-4648-a62e-9655764f582b',4,'COMPLETED',NULL,NULL,NULL,0),(2,1,1,1,'2026-02-13','2026-02-13 04:52:37','c6e0ee70-60ab-4648-a62e-9655764f582b',4,'COMPLETED',NULL,NULL,NULL,0);
/*!40000 ALTER TABLE `visits` ENABLE KEYS */;
UNLOCK TABLES;
SET @@SESSION.SQL_LOG_BIN = @MYSQLDUMP_TEMP_LOG_BIN;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-02-13 15:49:27
