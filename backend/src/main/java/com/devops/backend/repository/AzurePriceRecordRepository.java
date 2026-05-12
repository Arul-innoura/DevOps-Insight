package com.devops.backend.repository;

import com.devops.backend.model.monitoring.AzurePriceRecord;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

public interface AzurePriceRecordRepository extends MongoRepository<AzurePriceRecord, String> {

    Optional<AzurePriceRecord> findByMeterId(String meterId);

    List<AzurePriceRecord> findByServiceNameIgnoreCaseContaining(String serviceName);

    List<AzurePriceRecord> findByArmRegionNameAndServiceNameIgnoreCase(String armRegionName, String serviceName);
}
