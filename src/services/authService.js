/**
 * Authentication Service for AuraTrack Desktop
 */

const { supabase, WEB_APP_URL } = require('../config/supabase');
const { logger } = require('../utils/logger');
const { ipcRenderer } = require('electron');

class AuthService {
  constructor() {
    this.currentUser = null;
    this.userProfile = null;
  }

  async getSession() {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        logger.error('Error fetching session:', error);
        return null;
      }
      if (session) {
        this.currentUser = session.user;
        await this.fetchUserProfile(session.user.id);
        return session;
      }
      return null;
    } catch (err) {
      logger.error('Exception fetching session:', err);
      return null;
    }
  }

  async fetchUserProfile(userId) {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profile && !error) {
        this.userProfile = profile;
        return profile;
      }
      return null;
    } catch (err) {
      logger.warn('Failed to fetch user profile:', err);
      return null;
    }
  }

  async loginWithEmail(email, password) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
      this.currentUser = data.user;
      await this.fetchUserProfile(data.user.id);
      return { success: true, user: data.user };
    } catch (err) {
      logger.error('Email login failed:', err);
      return { success: false, error: err.message || 'Login failed' };
    }
  }

  async loginWithAzureSSO() {
    try {
      logger.info('Initiating Azure SSO flow...');
      const result = await ipcRenderer.invoke('open-azure-sso-window', {
        redirectUrl: `${WEB_APP_URL}`
      });

      if (result.error) {
        throw new Error(result.error);
      }
      return { success: true, callbackUrl: result.callbackUrl };
    } catch (err) {
      logger.error('Azure SSO initiation failed:', err);
      return { success: false, error: err.message || 'SSO initialization failed' };
    }
  }

  async setSessionWithTokens(accessToken, refreshToken) {
    try {
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });

      if (error) throw error;
      this.currentUser = data.user;
      await this.fetchUserProfile(data.user.id);
      logger.info('Session established successfully for:', data.user?.email);
      return { success: true, user: data.user };
    } catch (err) {
      logger.error('Failed to set session with tokens:', err);
      return { success: false, error: err.message };
    }
  }

  async logout() {
    try {
      logger.info('Logging out current user...');
      await supabase.auth.signOut();
      this.currentUser = null;
      this.userProfile = null;
      return { success: true };
    } catch (err) {
      logger.error('Logout error:', err);
      return { success: false, error: err.message };
    }
  }

  getUser() {
    return this.currentUser;
  }

  getProfile() {
    return this.userProfile;
  }
}

module.exports = new AuthService();
