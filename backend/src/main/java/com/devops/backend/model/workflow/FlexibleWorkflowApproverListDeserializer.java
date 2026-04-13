package com.devops.backend.model.workflow;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/**
 * Accepts JSON arrays of plain strings (legacy) or full {@link WorkflowApprover} objects.
 */
public class FlexibleWorkflowApproverListDeserializer extends JsonDeserializer<List<WorkflowApprover>> {

    @Override
    public List<WorkflowApprover> deserialize(JsonParser p, DeserializationContext ctxt) throws IOException {
        JsonNode node = p.getCodec().readTree(p);
        if (node == null || node.isNull() || !node.isArray()) {
            return new ArrayList<>();
        }
        ObjectMapper om = (ObjectMapper) p.getCodec();
        List<WorkflowApprover> out = new ArrayList<>();
        for (JsonNode el : node) {
            if (el == null || el.isNull()) {
                continue;
            }
            if (el.isTextual()) {
                String t = el.asText().trim();
                if (!t.isEmpty()) {
                    out.add(WorkflowApprover.builder().email(t).build());
                }
            } else if (el.isObject()) {
                WorkflowApprover w = om.convertValue(el, WorkflowApprover.class);
                if (w != null && w.getEmail() != null && !w.getEmail().isBlank()) {
                    out.add(w);
                }
            }
        }
        return out;
    }
}
