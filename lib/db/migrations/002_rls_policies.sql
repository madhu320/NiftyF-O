-- =====================================================
-- MIGRATION 002: ROW-LEVEL SECURITY (RLS) POLICIES
-- =====================================================
-- Date: 2026-05-15
-- Description: Implement row-level security for multi-tenant data isolation
-- Version: 1.0.0
-- Requirements: Enable RLS at database level before applying

-- =====================================================
-- ENABLE RLS ON TABLES
-- =====================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_history ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES: USERS TABLE
-- =====================================================

-- Users can only see their own profile
CREATE POLICY user_self_view ON users
  FOR SELECT USING (
    auth.uid()::text = id::text OR 
    EXISTS (
      SELECT 1 FROM pg_roles 
      WHERE rolname = current_user AND rolsuper
    )
  );

-- Users can only update their own profile
CREATE POLICY user_self_update ON users
  FOR UPDATE USING (
    auth.uid()::text = id::text
  );

-- Only admins can insert new users
CREATE POLICY user_insert_admin ON users
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u 
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- =====================================================
-- RLS POLICIES: TRADING_ACCOUNTS TABLE
-- =====================================================

-- Users can only see their own trading accounts
CREATE POLICY trading_account_user_view ON trading_accounts
  FOR SELECT USING (user_id = auth.uid());

-- Users can only create trading accounts for themselves
CREATE POLICY trading_account_user_insert ON trading_accounts
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can only update their own trading accounts
CREATE POLICY trading_account_user_update ON trading_accounts
  FOR UPDATE USING (user_id = auth.uid());

-- Users can only delete their own trading accounts
CREATE POLICY trading_account_user_delete ON trading_accounts
  FOR DELETE USING (user_id = auth.uid());

-- =====================================================
-- RLS POLICIES: STRATEGIES TABLE
-- =====================================================

-- Users can only see their own strategies
CREATE POLICY strategy_user_view ON strategies
  FOR SELECT USING (user_id = auth.uid());

-- Users can only create strategies for themselves
CREATE POLICY strategy_user_insert ON strategies
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can only update their own strategies
CREATE POLICY strategy_user_update ON strategies
  FOR UPDATE USING (user_id = auth.uid());

-- Users can only delete their own strategies
CREATE POLICY strategy_user_delete ON strategies
  FOR DELETE USING (user_id = auth.uid());

-- =====================================================
-- RLS POLICIES: SIGNALS TABLE
-- =====================================================

-- Users can only see signals from their own strategies
CREATE POLICY signal_user_view ON signals
  FOR SELECT USING (
    strategy_id IN (
      SELECT id FROM strategies WHERE user_id = auth.uid()
    )
  );

-- Users can only create signals for their own strategies
CREATE POLICY signal_user_insert ON signals
  FOR INSERT WITH CHECK (
    strategy_id IN (
      SELECT id FROM strategies WHERE user_id = auth.uid()
    )
  );

-- =====================================================
-- RLS POLICIES: ORDERS TABLE
-- =====================================================

-- Users can only see their own orders
CREATE POLICY order_user_view ON orders
  FOR SELECT USING (user_id = auth.uid());

-- Users can only create orders for themselves
CREATE POLICY order_user_insert ON orders
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can only update their own orders (cancel, modify)
CREATE POLICY order_user_update ON orders
  FOR UPDATE USING (user_id = auth.uid());

-- =====================================================
-- RLS POLICIES: POSITIONS TABLE
-- =====================================================

-- Users can only see their own positions
CREATE POLICY position_user_view ON positions
  FOR SELECT USING (user_id = auth.uid());

-- Users can only create positions for themselves
CREATE POLICY position_user_insert ON positions
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can only update their own positions
CREATE POLICY position_user_update ON positions
  FOR UPDATE USING (user_id = auth.uid());

-- =====================================================
-- RLS POLICIES: DAILY_PERFORMANCE TABLE
-- =====================================================

-- Users can only see their own performance data
CREATE POLICY daily_perf_user_view ON daily_performance
  FOR SELECT USING (user_id = auth.uid());

-- System can insert performance records for users
CREATE POLICY daily_perf_system_insert ON daily_performance
  FOR INSERT WITH CHECK (true); -- Service account inserts

-- =====================================================
-- RLS POLICIES: RISK_LIMITS TABLE
-- =====================================================

-- Users can only see their own risk limits
CREATE POLICY risk_limit_user_view ON risk_limits
  FOR SELECT USING (user_id = auth.uid());

-- Users can only update their own risk limits
CREATE POLICY risk_limit_user_update ON risk_limits
  FOR UPDATE USING (user_id = auth.uid());

-- =====================================================
-- RLS POLICIES: AUDIT_LOG TABLE
-- =====================================================

-- Users can only see their own audit logs
CREATE POLICY audit_log_user_view ON audit_log
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM pg_roles 
      WHERE rolname = current_user AND rolsuper
    )
  );

-- System can insert audit logs
CREATE POLICY audit_log_system_insert ON audit_log
  FOR INSERT WITH CHECK (true); -- Service account inserts

-- =====================================================
-- RLS POLICIES: TRADE_HISTORY TABLE
-- =====================================================

-- Users can only see their own trade history
CREATE POLICY trade_history_user_view ON trade_history
  FOR SELECT USING (user_id = auth.uid());

-- System can insert trade history records
CREATE POLICY trade_history_system_insert ON trade_history
  FOR INSERT WITH CHECK (true); -- Service account inserts

-- =====================================================
-- NOTES
-- =====================================================
-- After enabling RLS, service accounts used by the backend need proper
-- role setup. Example:
-- CREATE ROLE trading_service NOINHERIT;
-- GRANT trading_service TO backend_app_user;
-- ALTER TABLE users OWNER TO trading_service;
