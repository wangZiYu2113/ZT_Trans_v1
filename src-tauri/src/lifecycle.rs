use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct ActiveQuery {
    pub query_id: String,
    pub source: String,
    pub stage: String,
}

#[derive(Debug, Default)]
pub struct QueryManager {
    active: Option<ActiveQuery>,
}

impl QueryManager {
    pub fn start_new_query(&mut self, source: &str) -> ActiveQuery {
        self.cancel_active_query();
        let query = ActiveQuery {
            query_id: Uuid::new_v4().to_string(),
            source: source.to_string(),
            stage: "started".to_string(),
        };
        self.active = Some(query.clone());
        query
    }

    pub fn cancel_active_query(&mut self) {
        if let Some(active) = &self.active {
            let _ = active.summary();
        }
        self.active = None;
    }
}

impl ActiveQuery {
    pub fn summary(&self) -> (&str, &str, &str) {
        (&self.query_id, &self.source, &self.stage)
    }
}
