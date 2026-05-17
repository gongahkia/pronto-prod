alter table agent_configs
  add column if not exists response_provider text not null default 'openai',
  add column if not exists embedding_provider text not null default 'openai';

create index if not exists agent_configs_provider_idx
  on agent_configs (response_provider, embedding_provider);
