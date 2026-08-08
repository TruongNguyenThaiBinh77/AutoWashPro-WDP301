import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, useRouter } from 'expo-router';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../../src/contexts/AuthContext';
import { AlertDialog, GoogleLogo, Input, Button, ScreenContainer, Text } from '../../src/components/common';
import { colors } from '../../src/theme/colors';

export default function LoginScreen() {
  const router = useRouter();
  const { login, loginWithGoogle, isLoading } = useAuth();

  const [formData, setFormData] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    const loadSavedCredentials = async () => {
      try {
        const savedEmail = await SecureStore.getItemAsync('aw_saved_email');
        const savedPassword = await SecureStore.getItemAsync('aw_saved_password');
        if (savedEmail && savedPassword) {
          setFormData({ email: savedEmail, password: savedPassword });
          setRememberMe(true);
        }
      } catch (error) {
        console.error('Failed to load credentials', error);
      }
    };
    loadSavedCredentials();
  }, []);

  const emailRef    = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const updateField = useCallback((field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setErrors(prev => prev[field] ? { ...prev, [field]: '' } : prev);
  }, []);

  const validateForm = (): boolean => {
    const e: Record<string, string> = {};
    if (!formData.email.trim())
      e.email = 'Vui lòng nhập email hoặc số điện thoại';
    else if (formData.email.includes('@') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email))
      e.email = 'Email không hợp lệ';
    if (!formData.password)
      e.password = 'Vui lòng nhập mật khẩu';
    else if (formData.password.length < 6)
      e.password = 'Mật khẩu phải có ít nhất 6 ký tự';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleLogin = async () => {
    if (!validateForm()) return;
    try {
      await login(formData.email.trim(), formData.password);
      
      if (rememberMe) {
        await SecureStore.setItemAsync('aw_saved_email', formData.email.trim());
        await SecureStore.setItemAsync('aw_saved_password', formData.password);
      } else {
        await SecureStore.deleteItemAsync('aw_saved_email');
        await SecureStore.deleteItemAsync('aw_saved_password');
      }
    } catch (error: any) {
      AlertDialog.error('Đăng nhập thất bại', parseLoginError(error));
    }
  };

  const parseLoginError = (error: any): string => {
    if (!error.response) return 'Không thể kết nối. Vui lòng kiểm tra internet và thử lại.';
    const { status, data } = error.response;
    switch (status) {
      case 400: return data?.message || 'Dữ liệu không hợp lệ.';
      case 401:
        if (data?.code === 'ACCOUNT_LOCKED') return 'Tài khoản đã bị khóa. Vui lòng liên hệ hỗ trợ.';
        if (data?.code === 'ACCOUNT_INACTIVE') return 'Tài khoản chưa kích hoạt. Vui lòng kiểm tra email.';
        return 'Email hoặc mật khẩu không chính xác.';
      case 429: return 'Quá nhiều yêu cầu. Vui lòng thử lại sau 1 phút.';
      case 500: case 502: case 503: return 'Máy chủ đang bận. Vui lòng thử lại sau ít phút.';
      default: return data?.message || 'Đã xảy ra lỗi. Vui lòng thử lại.';
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken || (userInfo as any).idToken;
      if (idToken) {
        await loginWithGoogle(idToken);
      } else {
        AlertDialog.error('Đăng nhập thất bại', 'Không lấy được xác thực từ Google. Vui lòng thử lại.');
      }
    } catch (error: any) {
      console.log('Google login error detail:', error);
      if (error.code === statusCodes.SIGN_IN_CANCELLED || error.code === 'ASYNC_OP_IN_PROGRESS') {
        return;
      }
      
      let errorMsg = 'Không thể kết nối với Google. Vui lòng thử lại.';
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        errorMsg = 'Google Play Services không khả dụng hoặc chưa được cập nhật trên thiết bị.';
      } else if (String(error.code) === '10' || error.code === (statusCodes as any).DEVELOPER_ERROR) {
        errorMsg = 'Lỗi cấu hình Google (Web Client ID hoặc SHA-1 fingerprint chưa đúng trên Google Developer Console).';
      } else if (error.response?.data?.message) {
        errorMsg = error.response.data.message;
      } else if (error.message) {
        errorMsg = error.message;
      }

      AlertDialog.error('Đăng nhập thất bại', errorMsg);
    }
  };

  const renderContent = () => (
    <>
      {/* Top bar */}
      <View style={s.topbar}>
        {router.canGoBack() && (
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Heading */}
      <View style={s.heading}>
        <Text variant="h2" weight="700" style={s.title}>Đăng nhập</Text>
        <Text variant="body" color="textSecondary" style={s.subtitle}>
          Rất vui được gặp lại bạn! Vui lòng nhập thông tin để tiếp tục.
        </Text>
      </View>

      {/* Form */}
      <View style={s.form}>
        <Input
          ref={emailRef as any}
          label="Email / Số điện thoại"
          placeholder="Nhập email hoặc số điện thoại"
          keyboardType="email-address"
          autoCapitalize="none"
          value={formData.email}
          onChangeText={v => updateField('email', v)}
          error={errors.email}
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          blurOnSubmit={false}
        />

        <Input
          ref={passwordRef as any}
          label="Mật khẩu"
          placeholder="Nhập mật khẩu của bạn"
          secureTextEntry
          autoCapitalize="none"
          value={formData.password}
          onChangeText={v => updateField('password', v)}
          error={errors.password}
          returnKeyType="done"
          onSubmitEditing={handleLogin}
        />

        <View style={s.optionsRow}>
          <TouchableOpacity 
            style={s.rememberMe} 
            activeOpacity={0.7}
            onPress={() => setRememberMe(!rememberMe)}
          >
            <Ionicons 
              name={rememberMe ? "checkbox" : "square-outline"} 
              size={20} 
              color={rememberMe ? colors.primary : colors.textTertiary} 
            />
            <Text variant="bodySmall" color="textSecondary" style={{ marginLeft: 8 }}>
              Ghi nhớ tài khoản
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={s.forgot} 
            activeOpacity={0.7}
            onPress={() => router.push('/(auth)/forgot-password')}
          >
            <Text variant="body" weight="600" color="primary">Quên mật khẩu?</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Actions */}
      <View style={s.actions}>
        <Button
          title="Đăng nhập"
          variant="primary"
          size="large"
          fullWidth
          loading={isLoading}
          onPress={handleLogin}
        />

        <View style={s.dividerWrap}>
          <View style={s.dividerLine} />
          <Text variant="labelSmall" weight="700" color="textTertiary" style={s.dividerText}>HOẶC</Text>
          <View style={s.dividerLine} />
        </View>

        <Button
          title="Đăng nhập bằng Google"
          variant="outline"
          size="large"
          fullWidth
          loading={isLoading}
          onPress={handleGoogleLogin}
          icon={<GoogleLogo size={22} />}
          style={s.googleBtn}
          textStyle={s.googleBtnText}
        />

        <Text variant="body" align="center" color="textSecondary" style={s.footerNote}>
          Chưa có tài khoản?{' '}
          <Link href="/(auth)/register" asChild>
            <Text variant="body" weight="700" color="primary">Đăng ký ngay</Text>
          </Link>
        </Text>
      </View>
    </>
  );

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      {Platform.OS === 'ios' ? (
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={s.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            {renderContent()}
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {renderContent()}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 60 },

  topbar: { height: 44, justifyContent: 'center', marginBottom: 24 },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceDark, justifyContent: 'center', alignItems: 'center' },

  heading: { marginBottom: 32 },
  title: { letterSpacing: -1, marginBottom: 8 },
  subtitle: { lineHeight: 24 },
  
  form: { marginBottom: 8 },
  optionsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingVertical: 8 },
  rememberMe: { flexDirection: 'row', alignItems: 'center' },
  forgot: { },

  actions: { marginTop: 16 },
  
  dividerWrap: { flexDirection: 'row', alignItems: 'center', marginVertical: 32 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { marginHorizontal: 16 },

  googleBtn: {
    backgroundColor: '#FFFFFF',
    borderColor: colors.border,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  googleBtnText: {
    color: colors.textPrimary,
  },
  
  footerNote: { marginTop: 32 },
});
