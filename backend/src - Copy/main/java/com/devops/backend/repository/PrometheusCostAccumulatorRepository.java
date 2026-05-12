package com.devops.backend.repository;

import com.devops.backend.model.monitoring.PrometheusCostAccumulator;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

public interface PrometheusCostAccumulatorRepository extends MongoRepository<PrometheusCostAccumulator, String> {

    Optional<PrometheusCostAccumulator> findByEnvAndScopeAndScopeKeyAndDimension(
            String env, String scope, String scopeKey, String dimension);

    List<PrometheusCostAccumulator> findByEnv(String env);

    List<PrometheusCostAccumulator> findByEnvAndScope(String env, String scope);

    List<PrometheusCostAccumulator> findByEnvAndNamespace(String env, String namespace);
}
