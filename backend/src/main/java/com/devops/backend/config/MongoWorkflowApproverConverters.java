package com.devops.backend.config;

import com.devops.backend.model.workflow.WorkflowApprover;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.data.convert.ReadingConverter;
import org.springframework.data.mongodb.core.convert.MongoCustomConversions;

import java.util.Collections;

/**
 * MongoDB stores legacy email routing as BSON string arrays; Java model uses {@link WorkflowApprover}.
 * Spring Data needs an explicit read converter for each string element.
 */
@Configuration
public class MongoWorkflowApproverConverters {

    @Bean
    public MongoCustomConversions workflowApproverMongoCustomConversions() {
        return new MongoCustomConversions(Collections.singletonList(StringToWorkflowApproverConverter.INSTANCE));
    }

    @ReadingConverter
    enum StringToWorkflowApproverConverter implements Converter<String, WorkflowApprover> {
        INSTANCE;

        @Override
        public WorkflowApprover convert(String source) {
            if (source == null) {
                return null;
            }
            String t = source.trim();
            if (t.isEmpty()) {
                return null;
            }
            return WorkflowApprover.builder().email(t).build();
        }
    }
}
